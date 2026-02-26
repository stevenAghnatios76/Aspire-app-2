import { getModel } from "./gemini";
import { NextResponse } from "next/server";

// --- Rate Limiter (in-memory for MVP) ---

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const RATE_LIMIT_PER_MINUTE = 5;
const RATE_LIMIT_PER_DAY = 50;

export function checkAIRateLimit(userId: string): NextResponse | null {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  let entry = rateLimitStore.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(userId, entry);
  }

  // Clean up old timestamps (older than 24h)
  entry.timestamps = entry.timestamps.filter((t) => t > oneDayAgo);

  const recentMinute = entry.timestamps.filter((t) => t > oneMinuteAgo).length;
  const recentDay = entry.timestamps.length;

  if (recentMinute >= RATE_LIMIT_PER_MINUTE) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        message: `Maximum ${RATE_LIMIT_PER_MINUTE} AI requests per minute. Please wait.`,
        retryAfter: 60,
      },
      { status: 429 }
    );
  }

  if (recentDay >= RATE_LIMIT_PER_DAY) {
    return NextResponse.json(
      {
        error: "Daily rate limit exceeded",
        message: `Maximum ${RATE_LIMIT_PER_DAY} AI requests per day.`,
        retryAfter: 3600,
      },
      { status: 429 }
    );
  }

  // Record this request
  entry.timestamps.push(now);
  return null; // No rate limit hit
}

// --- Gemini Call Wrapper ---

interface CallGeminiOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  model?: string; // "gemini-1.5-flash" (default) or "gemini-1.5-pro"
}

export async function callGemini<T>(options: CallGeminiOptions): Promise<T> {
  try {
    const model = getModel(options.model || "gemini-1.5-flash");

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${options.systemPrompt}\n\n---\n\n${options.userPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no code fences, no extra text.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 1000,
        responseMimeType: "application/json",
      },
    });

    const content = result.response.text();
    if (!content) {
      throw new Error("Empty response from Gemini");
    }

    // Strip potential markdown code fences
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return JSON.parse(cleaned) as T;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse AI response as JSON");
    }
    throw error;
  }
}
