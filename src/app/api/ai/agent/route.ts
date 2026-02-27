import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkAgentRateLimit } from "@/lib/ai-helpers";
import { AgentMessageSchema } from "@/lib/validators";
import { createEventAgent, buildChatHistory } from "@/lib/agent";
import { HumanMessage } from "@langchain/core/messages";
import { ToolMessage } from "@langchain/core/messages";
import { getConversationHistory, saveConversationTurn } from "@/lib/conversation-store";

interface AgentResponse {
  reply: string;
  toolsUsed: string[];
  actionsPerformed: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: string;
  }>;
  eventIds?: string[];
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  const rateLimitResponse = checkAgentRateLimit(user.uid);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const body = await request.json();
    const parsed = AgentMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { message, history } = parsed.data;

    // Create the agent with the user's context
    const agent = await createEventAgent(user.uid);

    // Build chat history from previous turns
    const chatHistory = buildChatHistory(history);

    // Run the agent
    const result = await agent.invoke({
      messages: [...chatHistory, new HumanMessage(message)],
    });

    // Extract the final response and tool usage from messages
    const messages = result.messages;
    const toolsUsed: string[] = [];
    const actionsPerformed: AgentResponse["actionsPerformed"] = [];
    const eventIds: string[] = [];

    for (const msg of messages) {
      // Detect tool calls (AI messages with tool_calls)
      if (msg._getType() === "ai" && "tool_calls" in msg && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc.name && !toolsUsed.includes(tc.name)) {
            toolsUsed.push(tc.name);
          }
        }
      }

      // Detect tool results
      if (msg._getType() === "tool") {
        const toolMsg = msg as ToolMessage;
        const toolName = toolMsg.name || "unknown";
        let output = "";
        if (typeof toolMsg.content === "string") {
          output = toolMsg.content;
        }

        actionsPerformed.push({
          tool: toolName,
          input: {},
          output: output.slice(0, 500), // Truncate to avoid huge payloads
        });

        // Extract eventIds from create_event tool output
        if (toolName === "create_event") {
          try {
            const parsed = JSON.parse(output);
            if (parsed.eventId) {
              eventIds.push(parsed.eventId);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }

    // Get the final AI message as the reply
    let reply = "I wasn't able to process your request. Please try again.";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg._getType() === "ai" && typeof msg.content === "string" && msg.content.trim()) {
        reply = msg.content;
        break;
      }
    }

    const response: AgentResponse = {
      reply,
      toolsUsed,
      actionsPerformed,
      ...(eventIds.length > 0 ? { eventIds } : {}),
    };

    // Persist this turn server-side (fire-and-forget)
    saveConversationTurn(user.uid, message, reply).catch(() => {});

    return NextResponse.json(response);
  } catch (error) {
    console.error("AI Agent error:", error);
    return NextResponse.json(
      { error: "AI assistant temporarily unavailable. Please try again later." },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth(request);
  } catch (response) {
    return response as NextResponse;
  }

  try {
    const history = await getConversationHistory(user.uid);
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Conversation history fetch error:", error);
    return NextResponse.json({ history: [] });
  }
}
