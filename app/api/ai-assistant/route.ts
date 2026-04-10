import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";
import { getSessionUser, isManagerOrHigher } from "@/lib/authz";

/**
 * POST /api/ai-assistant
 *
 * Floating AI assistant endpoint for managers+ to ask questions about
 * operations. Loads current metrics, tasks, and department data as
 * context, then sends the user's question to Claude for analysis.
 *
 * Body: { message: string, history?: Array<{role: string, content: string}> }
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-your")) {
    return NextResponse.json(
      { error: "AI assistant requires an Anthropic API key." },
      { status: 503 },
    );
  }

  let body: { message: string; history?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    // Load operational context
    const [metricsRows, deptsRows, tasksRows, checkinRows, assignmentRows, usersRows] = await Promise.all([
      sql`
        SELECT m.id, m.name, m.current_value, m.previous_value, m.target_value,
               m.metric_type, m.direction, m.unit, m.notes,
               d.name AS department_name
        FROM metrics m
        LEFT JOIN departments d ON d.id = m.department_id
        ORDER BY d.sort_order ASC NULLS LAST, m.sort_order ASC
      `,
      sql`
        SELECT name, priority_score, description, notes,
               (SELECT COUNT(*)::int FROM metrics WHERE department_id::text = departments.id::text) AS metric_count,
               (SELECT COUNT(*)::int FROM user_departments ud JOIN users u ON u.id = ud.user_id WHERE ud.department_id::text = departments.id::text AND u.is_active = TRUE) AS member_count
        FROM departments
        ORDER BY sort_order ASC
      `,
      sql`
        SELECT t.title, t.priority, t.status, t.due_date,
               d.name AS department_name, u.name AS assignee_name
        FROM tasks t
        LEFT JOIN departments d ON d.id::text = t.department_id::text
        LEFT JOIN users u ON u.id::text = t.assignee_id::text
        WHERE t.status != 'done'
        ORDER BY t.created_at DESC
        LIMIT 30
      `,
      sql`
        SELECT COUNT(*)::int AS total,
               COUNT(CASE WHEN status IN ('submitted','ai_processed','reviewed') THEN 1 END)::int AS completed
        FROM daily_checkins
        WHERE checkin_date = CURRENT_DATE
      `,
      sql`
        SELECT ma.metric_id, ma.role_in_metric, u.id AS user_id, u.name AS user_name, u.role AS user_role,
               m.name AS metric_name, d.name AS department_name
        FROM metric_assignments ma
        JOIN users u ON u.id = ma.user_id
        JOIN metrics m ON m.id = ma.metric_id
        LEFT JOIN departments d ON d.id = m.department_id
        WHERE u.is_active = TRUE
        ORDER BY m.sort_order ASC
      `,
      sql`
        SELECT id, name, email, role FROM users
        WHERE is_active = TRUE AND role != 'super_admin'
        ORDER BY name ASC
      `,
    ]);

    const metrics = rowsToCamel(metricsRows as Record<string, unknown>[]);
    const depts = rowsToCamel(deptsRows as Record<string, unknown>[]);
    const tasks = rowsToCamel(tasksRows as Record<string, unknown>[]);
    const checkin = (checkinRows[0] ?? { total: 0, completed: 0 }) as { total: number; completed: number };
    const assignments = rowsToCamel(assignmentRows as Record<string, unknown>[]);
    const users = rowsToCamel(usersRows as Record<string, unknown>[]);

    // Build assignment lookup: metric name -> list of assigned people
    const metricAssignees = new Map<string, string[]>();
    for (const a of assignments as Record<string, unknown>[]) {
      const key = String(a.metricName);
      if (!metricAssignees.has(key)) metricAssignees.set(key, []);
      metricAssignees.get(key)!.push(`${a.userName} (${a.roleInMetric})`);
    }

    // Build context summary
    const contextParts: string[] = [];

    contextParts.push(`=== DEPARTMENTS (${depts.length}) ===`);
    for (const d of depts as Record<string, unknown>[]) {
      contextParts.push(`- ${d.name}: ${d.memberCount} members, ${d.metricCount} metrics, priority ${d.priorityScore}/100`);
      if (d.notes) contextParts.push(`  Notes: ${String(d.notes).slice(0, 100)}`);
    }

    contextParts.push(`\n=== METRICS (${metrics.length}) ===`);
    for (const m of metrics as Record<string, unknown>[]) {
      const delta = Number(m.currentValue) - Number(m.previousValue);
      const target = m.targetValue ? ` / target: ${m.targetValue}` : "";
      const assignees = metricAssignees.get(String(m.name));
      const assigneeStr = assignees?.length ? ` | Assigned: ${assignees.join(", ")}` : " | No one assigned";
      contextParts.push(`- [${m.departmentName || "General"}] ${m.name}: ${m.currentValue}${target} (${delta >= 0 ? "+" : ""}${delta}) ${m.unit} [${m.direction}]${assigneeStr}`);
      if (m.notes) contextParts.push(`  Notes: ${String(m.notes).slice(0, 80)}`);
    }

    contextParts.push(`\n=== ACTIVE TASKS (${tasks.length}) ===`);
    for (const t of (tasks as Record<string, unknown>[]).slice(0, 15)) {
      contextParts.push(`- [${t.priority}] ${t.title} (${t.status}) ${t.departmentName ? `— ${t.departmentName}` : ""} ${t.assigneeName ? `assigned: ${t.assigneeName}` : "unassigned"}`);
    }

    contextParts.push(`\n=== TODAY'S CHECK-INS ===`);
    contextParts.push(`${checkin.completed} completed out of ${checkin.total} expected`);

    contextParts.push(`\n=== TEAM MEMBERS (${users.length}) ===`);
    for (const u of (users as Record<string, unknown>[]).slice(0, 30)) {
      contextParts.push(`- ${u.name} (${u.role}) [id: ${u.id}]`);
    }

    const operationalContext = contextParts.join("\n");

    // Build messages
    const messages: Array<{ role: string; content: string }> = [];

    // Include conversation history (last 10 messages)
    if (body.history?.length) {
      for (const msg of body.history.slice(-10)) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content: body.message });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        system: `You are an AI operations assistant for Business Hub, a business management platform. You have access to real-time operational data.

Your role:
- Answer questions about company operations, metrics, tasks, and team performance
- Provide insights on trends, bottlenecks, and recommendations
- Be concise and actionable — focus on what matters
- Use numbers from the data, not guesses
- If you don't have data to answer, say so honestly
- PROACTIVELY suggest sending alerts/notifications when you spot issues

SUGGESTED ACTIONS:
When you identify a problem (metric at 0, negative trend, missed target, stagnant metric, etc.), suggest sending a notification. Use this EXACT format on its own line:

[ACTION:NOTIFY|userId|Alert title|Alert message]

Examples:
[ACTION:NOTIFY|abc-123|Sites Ready to Sell is 0|Your metric "Sites Ready to Sell" is at 0. Please update your progress or report blockers.]
[ACTION:NOTIFY|ALL_MANAGERS|Revenue below target|Total revenue is 40% below target for this month. Review department contributions.]

Rules for actions:
- Use the actual user ID from the team list when targeting a specific person
- Use ALL_MANAGERS to notify all managers, admins, and super admins
- Use ALL_LEADS to notify all leads
- Use ALL_ASSIGNED:metricName to notify everyone assigned to a specific metric
- Suggest 1-3 relevant actions per response, not more
- Only suggest actions when there's a real issue worth alerting about
- Place each action on its own line at the END of your response, after your analysis

FORMATTING RULES (strict):
- Do NOT use markdown. No #, ##, **, *, backticks, or any markdown syntax.
- Use plain text only.
- Use simple dashes (-) for bullet points.
- Use line breaks to separate sections.
- Use ALL CAPS sparingly for section headers if needed.
- Keep it conversational and easy to read in a chat bubble.
- The [ACTION:...] lines are the ONLY exception to plain text — they get parsed into buttons.

Current operational data:
${operationalContext}

Today's date: ${new Date().toISOString().slice(0, 10)}
Asking user: ${me.name} (${me.role})`,
        messages,
      }),
    });

    if (!res.ok) {
      console.error("[ai-assistant] Claude API error:", res.status);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text ?? "I couldn't generate a response.";

    return NextResponse.json({ data: { reply } });
  } catch (e: unknown) {
    console.error("[ai-assistant] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
