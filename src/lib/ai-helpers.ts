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

// --- Agent Rate Limiter (separate limits for heavier agent calls) ---

const agentRateLimitStore = new Map<string, RateLimitEntry>();

const AGENT_RATE_LIMIT_PER_MINUTE = 3;
const AGENT_RATE_LIMIT_PER_DAY = 20;

export function checkAgentRateLimit(userId: string): NextResponse | null {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;

  let entry = agentRateLimitStore.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    agentRateLimitStore.set(userId, entry);
  }

  entry.timestamps = entry.timestamps.filter((t) => t > oneDayAgo);

  const recentMinute = entry.timestamps.filter((t) => t > oneMinuteAgo).length;
  const recentDay = entry.timestamps.length;

  if (recentMinute >= AGENT_RATE_LIMIT_PER_MINUTE) {
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        message: `Maximum ${AGENT_RATE_LIMIT_PER_MINUTE} agent requests per minute. Please wait.`,
        retryAfter: 60,
      },
      { status: 429 }
    );
  }

  if (recentDay >= AGENT_RATE_LIMIT_PER_DAY) {
    return NextResponse.json(
      {
        error: "Daily rate limit exceeded",
        message: `Maximum ${AGENT_RATE_LIMIT_PER_DAY} agent requests per day.`,
        retryAfter: 3600,
      },
      { status: 429 }
    );
  }

  entry.timestamps.push(now);
  return null;
}

// --- Truncated JSON Repair ---

function repairTruncatedJson(text: string): string | null {
  // Only attempt repair if it looks like truncated JSON
  if (!text.startsWith('{') && !text.startsWith('[')) return null;

  let repaired = text;

  // Check if we're inside an unterminated string — find last unescaped quote
  const chars = repaired.split('');
  let inString = false;
  let lastQuoteIndex = -1;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === '\\') { i++; continue; }
    if (chars[i] === '"') {
      inString = !inString;
      lastQuoteIndex = i;
    }
  }
  if (inString) {
    // Close the open string
    repaired += '"';
  }

  // Remove any trailing comma after the last value
  repaired = repaired.replace(/,\s*$/, '');

  // Close open brackets/braces
  const openStack: string[] = [];
  let inStr = false;
  for (let i = 0; i < repaired.length; i++) {
    if (repaired[i] === '\\' && inStr) { i++; continue; }
    if (repaired[i] === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (repaired[i] === '{') openStack.push('}');
    else if (repaired[i] === '[') openStack.push(']');
    else if (repaired[i] === '}' || repaired[i] === ']') openStack.pop();
  }
  while (openStack.length > 0) {
    repaired += openStack.pop();
  }

  // Validate the repaired JSON actually parses
  JSON.parse(repaired); // throws if still invalid
  return repaired;
}

// --- Gemini Call Wrapper ---

interface CallGeminiOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  model?: string; // "gemini-2.5-flash" (default) or "gemini-2.5-pro"
}

export async function callGemini<T>(options: CallGeminiOptions): Promise<T> {
  try {
    const model = getModel(options.model || "gemini-2.5-flash");

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

    // Strip potential markdown code fences and surrounding text
    let cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // First attempt: direct parse
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      // Second attempt: extract JSON object/array from the response
      const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]) as T;
        } catch {
          // Fall through to repair attempt
        }
      }

      // Third attempt: try to repair truncated JSON (close open strings/arrays/objects)
      try {
        const repaired = repairTruncatedJson(cleaned);
        if (repaired) {
          return JSON.parse(repaired) as T;
        }
      } catch {
        // Fall through to error
      }

      console.error("Failed to parse Gemini response. Raw content:", content);
      throw new Error("Failed to parse AI response as JSON");
    }
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === "Failed to parse AI response as JSON"
    ) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new Error("Failed to parse AI response as JSON");
    }
    throw error;
  }
}
