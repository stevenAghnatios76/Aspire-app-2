import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkAIRateLimit, callGemini } from "@/lib/ai-helpers";
import { GenerateDescriptionSchema } from "@/lib/validators";

interface DescriptionResponse {
  description: string;
  alternates: string[];
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  // Rate limit check
  const rateLimitResponse = checkAIRateLimit(user.uid);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const parsed = GenerateDescriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { title, eventType, details, tone, maxLength } = parsed.data;

    const systemPrompt = `You are a professional event copywriter. Generate an engaging event description based on the provided details.

Rules:
- Match the requested tone exactly
- Stay within the specified maximum character length of ${maxLength} characters
- Include a compelling opening line
- Mention key details (what, when context, who it's for)
- End with a call-to-action (e.g., "RSVP now", "Don't miss out")
- Do NOT invent specific dates/times/locations — only use what's provided

Return JSON:
{
  "description": "The generated description text",
  "alternates": ["A shorter variant", "A more casual variant"]
}`;

    const userPrompt = JSON.stringify({
      title,
      eventType: eventType || "general",
      details: details || "No additional details provided",
      tone,
      maxLength,
    });

    const result = await callGemini<DescriptionResponse>({
      systemPrompt,
      userPrompt,
      temperature: 0.7,
      maxTokens: 1000,
      model: "gemini-2.5-flash",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("AI Description Generator error:", error);
    return NextResponse.json(
      { error: "AI service temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}
