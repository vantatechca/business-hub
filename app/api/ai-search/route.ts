import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authz";

/**
 * POST /api/ai-search
 *
 * Natural-language search. Takes a user query and a list of items (with
 * ids and searchable fields) and returns the ids of the items that match
 * the query's intent.
 *
 * Body: {
 *   query: string,
 *   items: Array<{ id: string, text: string }>  // pre-stringified for Claude
 *   targetName?: string  // e.g., "tasks", "expenses" — for better prompts
 * }
 *
 * Response: { matchingIds: string[], explanation?: string }
 */
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

  let body: { query: string; items: Array<{ id: string; text: string }>; targetName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.query?.trim() || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "query and items required" }, { status: 400 });
  }

  // Cap items to prevent huge payloads
  const items = body.items.slice(0, 500);
  const targetName = body.targetName || "items";

  try {
    const itemsText = items.map((it, i) => `${i}: [id=${it.id}] ${it.text}`).join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1500,
        system: `You are a search assistant. Given a user's natural-language query and a list of ${targetName}, return the ids of the items that best match the intent of the query.

Rules:
- Be inclusive but precise — include items that clearly relate to the query's topic or intent
- Consider semantic matches, not just keyword matches (e.g., "shopify" should match "store", "e-commerce", "online shop" contexts)
- Return ONLY valid JSON in this exact shape:
  { "matchingIds": ["id1", "id2", ...], "explanation": "brief sentence explaining why these matched" }
- If nothing matches, return { "matchingIds": [], "explanation": "No matches found for the query" }
- Do NOT return any text outside the JSON`,
        messages: [{
          role: "user",
          content: `Query: "${body.query}"\n\n${targetName} (${items.length}):\n${itemsText}`,
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[ai-search] Claude API error:", res.status, err);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse AI response" }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      data: {
        matchingIds: Array.isArray(parsed.matchingIds) ? parsed.matchingIds : [],
        explanation: parsed.explanation || "",
      },
    });
  } catch (e: unknown) {
    console.error("[ai-search] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
