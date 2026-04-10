import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/authz";

/**
 * POST /api/scan-receipt
 *
 * Accepts a receipt/document image (base64) and uses Claude Vision to
 * extract expense information: vendor, amount, currency, date, description.
 *
 * Body: { image: string (base64 data URI or raw base64), mimeType?: string }
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.startsWith("sk-ant-your")) {
    return NextResponse.json(
      { error: "Receipt scanning requires an Anthropic API key. Configure ANTHROPIC_API_KEY in your environment." },
      { status: 503 },
    );
  }

  let body: { image: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.image) {
    return NextResponse.json({ error: "image is required (base64)" }, { status: 400 });
  }

  // Strip data URI prefix if present
  let base64 = body.image;
  let mediaType = body.mimeType || "image/jpeg";
  if (base64.startsWith("data:")) {
    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      mediaType = match[1];
      base64 = match[2];
    }
  }

  try {
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
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            {
              type: "text",
              text: `Analyze this receipt/invoice/document image. Extract EACH individual line item as a separate entry.

Return ONLY valid JSON (no markdown, no explanation):
{
  "vendor": "string — store or company name",
  "currency": "USD" or "CAD" — detected currency,
  "date": "YYYY-MM-DD" or null if not readable,
  "items": [
    { "description": "string — what was purchased", "qty": number, "unitPrice": number, "amount": number }
  ],
  "tax": number or null,
  "total": number,
  "confidence": number — 0 to 1
}

Rules:
- Extract EVERY line item separately — do NOT combine them into one total
- Each item should have its own description, quantity, unit price, and line amount
- Include tax as a separate field (not as a line item)
- The total is the final amount including tax
- Default currency to "USD" if unclear
- If the image is not a receipt/invoice, return { "error": "Not a receipt", "confidence": 0 }`,
            },
          ],
        }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[scan-receipt] Claude API error:", res.status, err);
      return NextResponse.json({ error: "Failed to analyze receipt" }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";

    // Parse JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse receipt data" }, { status: 422 });
    }

    const extracted = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ data: extracted });
  } catch (e: unknown) {
    console.error("[scan-receipt] error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
