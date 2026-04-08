import { NextResponse } from "next/server";
import { curatedInspiration, toDateKey, pickEmoji, greetingForHour, type Inspiration } from "@/lib/dailyInspiration";

export const dynamic = "force-dynamic";

// Per-server-process cache keyed by date so Claude is hit at most once per day
// (or once per server cold-start, which in Render means once per deploy).
let cached: { dateKey: string; data: Inspiration } | null = null;

async function claudeQuote(dateKey: string): Promise<{ quote: string; author: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-your")) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: "You generate one short motivational quote for a team dashboard. The quote should be encouraging about work, personal growth, persistence, or team effort. Return ONLY valid JSON in this exact shape: {\"quote\": \"...\", \"author\": \"...\"} — no markdown, no preamble. Keep the quote under 140 characters. The author can be a real person or 'Unknown' for anonymous quotes. Avoid religious, political, or clichéd phrasing.",
        messages: [
          {
            role: "user",
            content: `Give me today's (${dateKey}) motivational quote for the team dashboard.`,
          },
        ],
      }),
      // 6-second timeout so a slow/hung Claude never blocks the dashboard.
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.content?.[0]?.text ?? "";
    // Strip markdown fences if the model added them despite instructions.
    const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.quote === "string" && typeof parsed?.author === "string") {
      return { quote: parsed.quote, author: parsed.author };
    }
    return null;
  } catch (e) {
    console.warn("[inspiration] Claude call failed:", (e as Error).message);
    return null;
  }
}

export async function GET() {
  const now = new Date();
  const dateKey = toDateKey(now);

  // Serve cached version if it's still today.
  if (cached && cached.dateKey === dateKey) {
    // Greeting depends on the viewer's clock hour, which can cross noon since
    // the cache was built. Recompute each request so "Good morning" flips to
    // "Good afternoon" mid-session.
    return NextResponse.json({
      data: { ...cached.data, greeting: greetingForHour(now.getHours()) },
    });
  }

  // Try Claude first; fall back to curated list if it fails or isn't configured.
  const { emoji, label } = pickEmoji(dateKey);
  const live = await claudeQuote(dateKey);
  let data: Inspiration;
  if (live) {
    data = {
      greeting: greetingForHour(now.getHours()),
      emoji,
      emojiLabel: label,
      quote: live.quote,
      author: live.author,
      source: "claude",
      dateKey,
    };
  } else {
    data = curatedInspiration(now);
  }
  cached = { dateKey, data };
  return NextResponse.json({ data });
}
