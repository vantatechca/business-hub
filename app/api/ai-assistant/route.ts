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
    const [metricsRows, deptsRows, tasksRows, checkinRows] = await Promise.all([
      sql`
        SELECT m.name, m.current_value, m.previous_value, m.target_value,
               m.metric_type, m.direction, m.unit, m.notes,
               d.name AS department_name
        FROM metrics m
        JOIN departments d ON d.id = m.department_id
        ORDER BY d.sort_order ASC, m.sort_order ASC
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
    ]);

    const metrics = rowsToCamel(metricsRows as Record<string, unknown>[]);
    const depts = rowsToCamel(deptsRows as Record<string, unknown>[]);
    const tasks = rowsToCamel(tasksRows as Record<string, unknown>[]);
    const checkin = (checkinRows[0] ?? { total: 0, completed: 0 }) as { total: number; completed: number };

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
      contextParts.push(`- [${m.departmentName}] ${m.name}: ${m.currentValue}${target} (${delta >= 0 ? "+" : ""}${delta}) ${m.unit} [${m.direction}]`);
      if (m.notes) contextParts.push(`  Notes: ${String(m.notes).slice(0, 80)}`);
    }

    contextParts.push(`\n=== ACTIVE TASKS (${tasks.length}) ===`);
    for (const t of (tasks as Record<string, unknown>[]).slice(0, 15)) {
      contextParts.push(`- [${t.priority}] ${t.title} (${t.status}) ${t.departmentName ? `— ${t.departmentName}` : ""} ${t.assigneeName ? `assigned: ${t.assigneeName}` : "unassigned"}`);
    }

    contextParts.push(`\n=== TODAY'S CHECK-INS ===`);
    contextParts.push(`${checkin.completed} completed out of ${checkin.total} expected`);

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

FORMATTING RULES (strict):
- Do NOT use markdown. No #, ##, **, *, \`\`\`, or any markdown syntax.
- Use plain text only.
- Use simple dashes (-) for bullet points.
- Use line breaks to separate sections.
- Use ALL CAPS sparingly for section headers if needed.
- Keep it conversational and easy to read in a chat bubble.

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
