import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { buildAgentTools } from "./agent-tools";

const SYSTEM_PROMPT = `You are an intelligent event scheduling assistant for Aspire, an event management app.
Today is {ISO_DATE}. The current user's ID is {USER_ID}.

You help users:
- Plan and create events
- Check their schedule and find available times
- Invite people to events
- Build agendas
- Search for relevant events

ALWAYS:
- Confirm destructive actions (creating events, sending invitations) before calling the tool. Ask the user to confirm with a summary of what you're about to do.
- Resolve relative dates ("next Friday", "tomorrow") against today's date: {ISO_DATE}
- Be concise — one short paragraph per response unless showing structured data
- If you created an event, include its ID in your final response so the UI can surface a link
- When searching or checking schedules, summarize the results clearly

NEVER:
- Invent email addresses, user IDs, or event IDs
- Call create_event or invite_people without first confirming with the user
- Assume information that wasn't provided — ask for clarification instead`;

export async function createEventAgent(userId: string, userEmail: string, userName?: string) {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY!,
    temperature: 0.3,
  });

  const tools = buildAgentTools(userId, userEmail, userName);

  // Build the system prompt with current date and user ID
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const systemPrompt = SYSTEM_PROMPT
    .replace(/{ISO_DATE}/g, today)
    .replace(/{USER_ID}/g, userId);

  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: new SystemMessage(systemPrompt),
  });

  return agent;
}

export function buildChatHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
) {
  return history.map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
  );
}
