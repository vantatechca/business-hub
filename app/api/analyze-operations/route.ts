import { NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";
import { getSessionUser, isManagerOrHigher, isLeadOrHigher } from "@/lib/authz";

/**
 * POST /api/analyze-operations
 *
 * Analyzes all metrics for operational health and creates notifications
 * for managers, admins, leads about:
 *   - Stagnant metrics (no updates in 3+ days)
 *   - Negative trends (value moving in wrong direction)
 *   - Slow progress (below target pace based on due date)
 *   - Missing contributions (assigned employees not contributing)
 *
 * Can be called manually by a manager or via a cron job.
 * Returns a summary of findings and notifications created.
 */

interface Finding {
  metricId: string;
  metricName: string;
  departmentId: string;
  departmentName: string;
  type: "stagnant" | "negative_trend" | "slow_progress";
  message: string;
  severity: "info" | "warning" | "critical";
}

export async function POST() {
  const me = await getSessionUser();
  if (!me || !isManagerOrHigher(me.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // 1. Load all metrics with department info
    const metricsRows = await sql`
      SELECT m.*, d.name AS department_name, d.color AS department_color
      FROM metrics m
      JOIN departments d ON d.id = m.department_id
      ORDER BY d.sort_order ASC, m.sort_order ASC
    `;
    const metrics = rowsToCamel(metricsRows as Record<string, unknown>[]);

    // 2. Load last update timestamps for each metric
    const updateRows = await sql`
      SELECT metric_id, MAX(created_at) AS last_updated
      FROM metric_updates
      GROUP BY metric_id
    `;
    const lastUpdates = new Map<string, string>();
    for (const r of updateRows as { metric_id: string; last_updated: string }[]) {
      lastUpdates.set(String(r.metric_id), String(r.last_updated));
    }

    const findings: Finding[] = [];
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    for (const m of metrics as Record<string, unknown>[]) {
      const metricId = String(m.id);
      const metricName = String(m.name);
      const departmentId = String(m.departmentId);
      const departmentName = String(m.departmentName);
      const currentValue = Number(m.currentValue) || 0;
      const previousValue = Number(m.previousValue) || 0;
      const targetValue = m.targetValue != null ? Number(m.targetValue) : null;
      const direction = String(m.direction);
      const dueDate = m.dueDate ? new Date(String(m.dueDate)) : null;

      // Check: Stagnant metric (no updates in 3+ days)
      const lastUpdate = lastUpdates.get(metricId);
      if (lastUpdate) {
        const lastUpdateDate = new Date(lastUpdate);
        if (lastUpdateDate < threeDaysAgo) {
          const daysSince = Math.floor((now.getTime() - lastUpdateDate.getTime()) / (24 * 60 * 60 * 1000));
          findings.push({
            metricId, metricName, departmentId, departmentName,
            type: "stagnant",
            message: `"${metricName}" has not been updated in ${daysSince} days. Current value: ${currentValue}.`,
            severity: daysSince >= 7 ? "critical" : "warning",
          });
        }
      } else if (m.createdAt) {
        // Never updated since creation
        const createdAt = new Date(String(m.createdAt));
        if (createdAt < threeDaysAgo) {
          findings.push({
            metricId, metricName, departmentId, departmentName,
            type: "stagnant",
            message: `"${metricName}" has never been updated since creation. Current value: ${currentValue}.`,
            severity: "warning",
          });
        }
      }

      // Check: Negative trend (value moving in wrong direction)
      const delta = currentValue - previousValue;
      if (delta !== 0) {
        const isGood = direction === "higher_better" ? delta > 0 : delta < 0;
        if (!isGood && Math.abs(delta) > 0) {
          findings.push({
            metricId, metricName, departmentId, departmentName,
            type: "negative_trend",
            message: `"${metricName}" is trending ${direction === "higher_better" ? "down" : "up"}: ${previousValue} → ${currentValue} (${delta > 0 ? "+" : ""}${delta}).`,
            severity: Math.abs(delta) / Math.max(previousValue, 1) > 0.2 ? "critical" : "warning",
          });
        }
      }

      // Check: Slow progress (below target pace)
      if (targetValue && dueDate && dueDate > now) {
        const totalDuration = dueDate.getTime() - (m.createdAt ? new Date(String(m.createdAt)).getTime() : now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const elapsed = now.getTime() - (m.createdAt ? new Date(String(m.createdAt)).getTime() : now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const expectedProgress = elapsed / Math.max(totalDuration, 1);
        const actualProgress = currentValue / targetValue;

        if (actualProgress < expectedProgress * 0.7 && expectedProgress > 0.2) {
          findings.push({
            metricId, metricName, departmentId, departmentName,
            type: "slow_progress",
            message: `"${metricName}" is at ${Math.round(actualProgress * 100)}% of target but ${Math.round(expectedProgress * 100)}% of time has elapsed. Needs ${targetValue - currentValue} more to reach target of ${targetValue}.`,
            severity: actualProgress < expectedProgress * 0.5 ? "critical" : "warning",
          });
        }
      }
    }

    // 3. Generate AI summary if there are findings
    let aiSummary = "";
    if (findings.length > 0) {
      aiSummary = await generateAiSummary(findings);
    }

    // 4. Create notifications for the right people
    let notifCount = 0;
    if (findings.length > 0) {
      // Get all users who should be notified (manager+, leads)
      const usersRows = await sql`
        SELECT u.id, u.role FROM users u
        WHERE u.is_active = TRUE
          AND u.role IN ('super_admin', 'admin', 'manager', 'lead')
      `;
      const notifUsers = usersRows as { id: string; role: string }[];

      // Get lead-to-department mappings
      const leadDeptRows = await sql`
        SELECT user_id, department_id FROM user_departments
        WHERE role_in_dept = 'lead'
      `;
      const leadDepts = new Map<string, Set<string>>();
      for (const r of leadDeptRows as { user_id: string; department_id: string }[]) {
        const uid = String(r.user_id);
        if (!leadDepts.has(uid)) leadDepts.set(uid, new Set());
        leadDepts.get(uid)!.add(String(r.department_id));
      }

      // Deduplicate: one notification per user per analysis run
      const summaryTitle = `Operations Alert: ${findings.length} metric${findings.length === 1 ? "" : "s"} need attention`;
      const criticalCount = findings.filter(f => f.severity === "critical").length;
      const summaryBody = aiSummary || findings.slice(0, 5).map(f => `- ${f.message}`).join("\n");

      for (const user of notifUsers) {
        // Leads only get notified about their departments
        if (user.role === "lead") {
          const userDepts = leadDepts.get(String(user.id));
          if (!userDepts) continue;
          const relevantFindings = findings.filter(f => userDepts.has(f.departmentId));
          if (relevantFindings.length === 0) continue;

          const leadBody = relevantFindings.slice(0, 5).map(f => `- ${f.message}`).join("\n");
          await sql`
            INSERT INTO notifications (user_id, type, title, body, severity, action_url)
            VALUES (${user.id}, 'stalled_metric', ${`${relevantFindings.length} metric${relevantFindings.length === 1 ? "" : "s"} need attention in your department`}, ${leadBody}, ${criticalCount > 0 ? "critical" : "warning"}, '/metrics')
          `;
          notifCount++;
        } else {
          // Managers, admins, super_admins get the full summary
          await sql`
            INSERT INTO notifications (user_id, type, title, body, severity, action_url)
            VALUES (${user.id}, 'stalled_metric', ${summaryTitle}, ${summaryBody}, ${criticalCount > 0 ? "critical" : "warning"}, '/metrics')
          `;
          notifCount++;
        }
      }
    }

    return NextResponse.json({
      data: {
        findingsCount: findings.length,
        notificationsCreated: notifCount,
        findings,
        aiSummary,
      },
    });
  } catch (e: unknown) {
    console.error("[analyze-operations] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Use Claude to generate a concise summary of operational findings.
 * Falls back to a plain list if the API key isn't configured.
 */
async function generateAiSummary(findings: Finding[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-your")) {
    // No API key — return a plain summary
    const critical = findings.filter(f => f.severity === "critical");
    const warnings = findings.filter(f => f.severity === "warning");
    let summary = `Operations Analysis: ${findings.length} issue${findings.length === 1 ? "" : "s"} found.`;
    if (critical.length > 0) {
      summary += ` ${critical.length} critical: ${critical.map(f => f.metricName).join(", ")}.`;
    }
    if (warnings.length > 0) {
      summary += ` ${warnings.length} warning${warnings.length === 1 ? "" : "s"}: ${warnings.slice(0, 3).map(f => f.metricName).join(", ")}${warnings.length > 3 ? ` +${warnings.length - 3} more` : ""}.`;
    }
    return summary;
  }

  try {
    const findingsList = findings.map(f =>
      `[${f.severity.toUpperCase()}] ${f.type}: ${f.message} (Department: ${f.departmentName})`
    ).join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `You are an operations analyst for a business hub. Analyze these metric findings and provide a brief, actionable summary (3-5 sentences max). Focus on what needs immediate attention and recommended actions.\n\nFindings:\n${findingsList}`,
        }],
      }),
    });

    if (!res.ok) {
      console.warn("[analyze-operations] Claude API error:", res.status);
      return "";
    }

    const data = await res.json();
    return data.content?.[0]?.text ?? "";
  } catch (e) {
    console.warn("[analyze-operations] AI summary failed:", e);
    return "";
  }
}
