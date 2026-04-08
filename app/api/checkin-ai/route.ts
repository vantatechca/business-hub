import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a Business Hub check-in analyzer for a peptide e-commerce company with 600+ Shopify stores. A team member submitted their daily report. Extract structured data.

Return ONLY valid JSON (no markdown, no explanation):
{
  "extractedMetrics": [
    { "metricName": "string", "metricId": "string|null", "delta": number|null, "newValue": number|null, "confidence": number, "unit": "string" }
  ],
  "blockers": [
    { "description": "string", "severity": "low|medium|high" }
  ],
  "crossTeamMentions": ["string"],
  "summary": "1-2 sentence summary",
  "overallConfidence": number
}

Rules:
- Never invent numbers not mentioned
- delta = change amount (+5 = increased by 5)
- newValue = absolute value ("now at 10" → newValue:10)
- confidence below 0.7 = flag for human review
- "no change" or "same" → delta:0, confidence:0.9
- Watch for: GMC accounts, Gmail accounts, Shopify orders, Stripe orders, blogs, response time, reviews`;

function mockParse(text: string) {
  const hasBlocker = /block|wait|issue|problem|stuck|delay/i.test(text);
  return {
    extractedMetrics: [],
    blockers: hasBlocker ? [{ description: "Possible blocker — review manually.", severity: "medium" }] : [],
    crossTeamMentions: [],
    summary: (text.slice(0, 140) + (text.length > 140 ? "…" : "")),
    overallConfidence: 0.3,
    _mockData: true,
  };
}

export async function POST(req: NextRequest) {
  const { rawResponse, assignedMetrics } = await req.json();
  if (!rawResponse?.trim()) {
    return NextResponse.json({ extractedMetrics:[], blockers:[], crossTeamMentions:[], summary:"No response.", overallConfidence:0 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-your")) {
    return NextResponse.json(mockParse(rawResponse));
  }

  const metricsCtx = assignedMetrics?.length
    ? `\n\nMember's assigned metrics:\n${assignedMetrics.map((m: {name:string;currentValue:number;unit:string;id:string}) => `- ${m.name} (current: ${m.currentValue} ${m.unit}, id: ${m.id})`).join("\n")}`
    : "";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type":"application/json", "x-api-key":apiKey, "anthropic-version":"2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role:"user", content:`Report:\n"${rawResponse}"${metricsCtx}` }],
      }),
    });
    if (!res.ok) return NextResponse.json(mockParse(rawResponse));
    const data = await res.json();
    const text = (data.content?.[0]?.text ?? "").replace(/```json\s*/gi,"").replace(/```/g,"").trim();
    const parsed = JSON.parse(text);
    // Fuzzy match metric IDs
    if (parsed.extractedMetrics && assignedMetrics) {
      parsed.extractedMetrics = parsed.extractedMetrics.map((em: {metricName:string;metricId:string|null}) => {
        if (em.metricId) return em;
        const match = (assignedMetrics as {name:string;id:string}[]).find(am =>
          am.name.toLowerCase().includes(em.metricName.toLowerCase().split(" ")[0]) ||
          em.metricName.toLowerCase().includes(am.name.toLowerCase().split(" ")[0])
        );
        return match ? { ...em, metricId: match.id } : em;
      });
    }
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(mockParse(rawResponse));
  }
}
