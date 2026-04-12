import { NextRequest, NextResponse } from "next/server";
import { sql, rowsToCamel } from "@/lib/db";
import { getSessionUser } from "@/lib/authz";

/**
 * POST /api/ai-global-search
 *
 * Global natural-language search across the business hub. Takes a query
 * like "find all tasks related to shopify" or "show me the sites
 * department", figures out which page (tasks, assets/metrics, departments,
 * expenses, revenue, employees, assignments) the user wants, and returns
 * the matching item IDs so the frontend can route + filter.
 *
 * Body: { query: string }
 *
 * Response:
 *   {
 *     data: {
 *       target: "tasks" | "metrics" | "departments" | "expenses" | "revenue" | "team" | "assignments" | "none",
 *       route: "/tasks" | "/metrics" | ...,
 *       matchingIds: string[],
 *       explanation: string,
 *     }
 *   }
 */

type Target = "tasks" | "metrics" | "departments" | "expenses" | "revenue" | "team" | "assignments" | "none";

const ROUTE_MAP: Record<Target, string> = {
  tasks: "/tasks",
  metrics: "/metrics",
  departments: "/departments",
  expenses: "/expenses",
  revenue: "/revenue",
  team: "/team",
  assignments: "/assignments",
  none: "/dashboard",
};

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-your")) {
    return NextResponse.json(
      { error: "AI search requires an Anthropic API key." },
      { status: 503 },
    );
  }

  let body: { query: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.query?.trim()) return NextResponse.json({ error: "query required" }, { status: 400 });

  try {
    // Step 1: Ask Claude to classify the query intent and target page.
    const classifyRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 200,
        system: `You classify natural-language search queries into ONE of these targets:
- tasks: anything about tasks, to-dos, work items, status, priorities
- metrics: anything about KPIs, assets, numbers being tracked (also called "metrics" or "assets")
- departments: anything about departments, teams as organizational units
- expenses: anything about money spent, bills, costs, invoices
- revenue: anything about income, sales revenue, money coming in
- team: anything about specific employees or team members
- assignments: anything about who is assigned to what metric
- none: if the query doesn't clearly map to any of the above

Return ONLY valid JSON: { "target": "tasks" | "metrics" | "departments" | "expenses" | "revenue" | "team" | "assignments" | "none" }
No text outside the JSON.`,
        messages: [{ role: "user", content: body.query }],
      }),
    });

    if (!classifyRes.ok) {
      return NextResponse.json({ error: "Classification failed" }, { status: 502 });
    }
    const classifyData = await classifyRes.json();
    const classifyText: string = classifyData.content?.[0]?.text ?? "{}";
    const classifyMatch = classifyText.match(/\{[\s\S]*\}/);
    const classified = classifyMatch ? JSON.parse(classifyMatch[0]) : { target: "none" };
    const target: Target = (["tasks", "metrics", "departments", "expenses", "revenue", "team", "assignments", "none"] as const).includes(classified.target)
      ? classified.target
      : "none";

    if (target === "none") {
      return NextResponse.json({
        data: {
          target: "none",
          route: "/dashboard",
          matchingIds: [],
          explanation: "Couldn't determine what you're looking for. Try being more specific (e.g., 'tasks', 'expenses', 'metrics').",
        },
      });
    }

    // Step 2: Fetch items for the target category
    const items: Array<{ id: string; text: string }> = [];
    try {
      if (target === "tasks") {
        const rows = await sql`
          SELECT t.id, t.title, t.priority, t.status, t.notes,
                 d.name AS department_name, u.name AS assignee_name
          FROM tasks t
          LEFT JOIN departments d ON d.id::text = t.department_id::text
          LEFT JOIN users u ON u.id = t.assignee_id
        `;
        for (const r of rows as Record<string, unknown>[]) {
          items.push({
            id: String(r.id),
            text: [r.title, r.priority, r.status, r.department_name, r.assignee_name, r.notes].filter(Boolean).join(" | "),
          });
        }
      } else if (target === "metrics") {
        const rows = await sql`
          SELECT m.id, m.name, m.notes, m.unit, m.metric_type, d.name AS department_name
          FROM metrics m
          LEFT JOIN departments d ON d.id = m.department_id
        `;
        for (const r of rows as Record<string, unknown>[]) {
          items.push({
            id: String(r.id),
            text: [r.name, r.department_name, r.unit, r.metric_type, r.notes].filter(Boolean).join(" | "),
          });
        }
      } else if (target === "departments") {
        const rows = await sql`SELECT id, name, description, notes FROM departments`;
        for (const r of rows as Record<string, unknown>[]) {
          items.push({
            id: String(r.id),
            text: [r.name, r.description, r.notes].filter(Boolean).join(" | "),
          });
        }
      } else if (target === "expenses") {
        const rows = await sql`
          SELECT e.id, e.description, e.amount, e.currency, e.month, e.year, d.name AS department_name
          FROM expense_entries e
          LEFT JOIN departments d ON d.id::text = e.department_id::text
        `;
        for (const r of rows as Record<string, unknown>[]) {
          items.push({
            id: String(r.id),
            text: [r.description, r.department_name, `${r.currency} ${r.amount}`, `${r.month} ${r.year}`].filter(Boolean).join(" | "),
          });
        }
      } else if (target === "revenue") {
        const rows = await sql`
          SELECT r.id, r.description, r.amount, r.currency, r.month, r.year, d.name AS department_name
          FROM revenue_entries r
          LEFT JOIN departments d ON d.id::text = r.department_id::text
        `;
        for (const row of rows as Record<string, unknown>[]) {
          items.push({
            id: String(row.id),
            text: [row.description, row.department_name, `${row.currency} ${row.amount}`, `${row.month} ${row.year}`].filter(Boolean).join(" | "),
          });
        }
      } else if (target === "team") {
        const rows = await sql`SELECT id, name, email, role FROM users WHERE is_active = TRUE AND role != 'super_admin'`;
        for (const r of rows as Record<string, unknown>[]) {
          items.push({
            id: String(r.id),
            text: [r.name, r.email, r.role].filter(Boolean).join(" | "),
          });
        }
      } else if (target === "assignments") {
        const rows = await sql`
          SELECT ma.metric_id AS id, m.name AS metric_name, u.name AS user_name, ma.role_in_metric
          FROM metric_assignments ma
          JOIN metrics m ON m.id = ma.metric_id
          JOIN users u ON u.id = ma.user_id
        `;
        for (const r of rows as Record<string, unknown>[]) {
          items.push({
            id: String(r.id),
            text: [r.metric_name, r.user_name, r.role_in_metric].filter(Boolean).join(" | "),
          });
        }
      }
    } catch (e) {
      console.warn("[ai-global-search] data fetch failed:", e);
    }

    if (items.length === 0) {
      return NextResponse.json({
        data: {
          target,
          route: ROUTE_MAP[target],
          matchingIds: [],
          explanation: `No ${target} found to search.`,
        },
      });
    }

    // Step 3: Ask Claude to pick matching IDs from the items
    const itemsCapped = items.slice(0, 500);
    const itemsText = itemsCapped.map((it, i) => `${i}: [id=${it.id}] ${it.text}`).join("\n");

    const matchRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        system: `You are a search assistant. Given a user's natural-language query and a list of ${target}, return the ids of the items that best match the query.

Rules:
- Be inclusive but precise — include items that clearly relate to the query's topic or intent
- Consider semantic matches, not just keyword matches
- Return ONLY valid JSON: { "matchingIds": ["id1", "id2"], "explanation": "brief sentence" }
- If nothing matches, return { "matchingIds": [], "explanation": "No matches found" }
- Do NOT return any text outside the JSON`,
        messages: [{ role: "user", content: `Query: "${body.query}"\n\n${target} (${itemsCapped.length}):\n${itemsText}` }],
      }),
    });

    if (!matchRes.ok) {
      return NextResponse.json({ error: "Match failed" }, { status: 502 });
    }
    const matchData = await matchRes.json();
    const matchText: string = matchData.content?.[0]?.text ?? "{}";
    const matchJson = matchText.match(/\{[\s\S]*\}/);
    const matched = matchJson ? JSON.parse(matchJson[0]) : { matchingIds: [], explanation: "" };

    return NextResponse.json({
      data: {
        target,
        route: ROUTE_MAP[target],
        matchingIds: Array.isArray(matched.matchingIds) ? matched.matchingIds : [],
        explanation: matched.explanation || "",
      },
    });
  } catch (e: unknown) {
    console.error("[ai-global-search] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
