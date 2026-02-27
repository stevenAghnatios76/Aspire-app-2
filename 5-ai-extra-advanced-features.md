# Advanced AI Features — Requirements

## Feature Completion Checklist

- [ ] Feature 1 — Post-Event Recap Generator
- [ ] Feature 2 — Personalized Event Recommendations
- [ ] Feature 3 — AI Agenda Builder
- [ ] Feature 4 — Attendance Prediction & Capacity Advisor
- [ ] Feature 5 — Voice-to-Event Creator
- [ ] Feature 6 — Agentic Event Assistant (LangChain)

---

**App:** Aspire App 2
**Stack:** Next.js 14 App Router · Firebase Auth · Firestore · `@google/generative-ai` (gemini-2.5-flash) · shadcn/ui · **LangChain** (`@langchain/core` · `@langchain/google-genai` · `langchain`)
**Existing AI utilities to reuse:**
- `src/lib/ai-helpers.ts` → `callGemini<T>()` + `checkAIRateLimit(userId)`
- `src/lib/auth.ts` → `requireAuth(request)`
- `src/hooks/useAI.ts` → `useAI<TReq, TRes>(endpoint)`
- `src/lib/api-client.ts` → `apiRequest<T>()`
- `src/lib/validators.ts` → Zod schemas (add new ones here)
- `src/types/firestore.ts` → TypeScript interfaces

---

## Feature 1 — Post-Event Recap Generator

### What it does
Event owner clicks one button after the event ends and receives a shareable recap with attendance analytics, highlights, and suggested follow-up actions.

### Where it appears
`/events/[id]` — below the Attendees section.
Visible only when `event.isOwner === true` AND `event.endDateTime < now()`.

### API route
`POST /api/ai/generate-recap`

**Request body:**
```ts
{
  eventId: string;
  includeAttendeeNames: boolean;
}
```

**Response:**
```ts
{
  summary: string;
  highlights: string[];
  attendanceInsights: {
    totalInvited: number;
    totalAttended: number;
    totalDeclined: number;
    attendanceRate: number;        // 0–1
    engagementNarrative: string;
  };
  followUpActions: string[];
  shareableText: string;           // ready-to-email formatted text
}
```

**Server logic:**
1. `requireAuth()` → `checkAIRateLimit()`
2. Validate body with `GenerateRecapSchema`
3. Fetch `events/{eventId}` — confirm `createdById === user.uid` and `endDateTime < now()`; 403 if not
4. Query `eventResponses` where `eventId == id` → group by status (ATTENDING, DECLINED, MAYBE)
5. Query `invitations` where `eventId == id` → total invited count
6. Call Gemini (temperature 0.6, maxTokens 1200) with attendance data
7. Write result back to `events/{id}` as `recap: { ...result, generatedAt: now }` for caching
8. Return result

**Gemini prompt guidance:**
System role: factual, upbeat event analyst. Ask for concrete highlights and actionable follow-ups based solely on the provided numbers and event metadata.

### New Zod schema
```ts
export const GenerateRecapSchema = z.object({
  eventId: z.string().min(1).max(128),
  includeAttendeeNames: z.boolean().default(false),
});
```

### New type fields
Add optional `recap` field to `EventDoc` in `src/types/firestore.ts`:
```ts
recap?: {
  summary: string;
  highlights: string[];
  attendanceInsights: {
    totalInvited: number;
    totalAttended: number;
    totalDeclined: number;
    attendanceRate: number;
    engagementNarrative: string;
  };
  followUpActions: string[];
  shareableText: string;
  generatedAt: string;
};
```

### Component
**File:** `src/components/ai/EventRecapGenerator.tsx`
**Pattern:** Dialog triggered by "Generate Recap" button (same pattern as `DescriptionGenerator`).

**Dialog tabs:**
1. **Summary** — prose summary text
2. **Highlights** — bullet list
3. **Follow-Ups** — actionable items list
4. **Shareable Text** — full formatted text + "Copy" button

**Props:**
```ts
{ eventId: string; eventTitle: string }
```

**Behavior:** If `event.recap` already exists on page load, show a "View Recap" button that opens the cached result without calling the API.

### Page integration
`src/app/(dashboard)/events/[id]/page.tsx` — after the Attendees card:
```tsx
{event.isOwner && new Date(event.endDateTime) < new Date() && (
  <EventRecapGenerator eventId={params.id} eventTitle={event.title} />
)}
```

---

## Feature 2 — Personalized Event Recommendations

### What it does
A curated "Events For You" row automatically surfaces upcoming public events matching the user's interest fingerprint, derived from their RSVP history and tag patterns.

### Where it appears
`/events` — between `<NlpSearchBar />` and the filter `<Tabs>`.
Hidden entirely if the user has no RSVP history.

### API route
`GET /api/ai/recommendations`
(GET — no body; user identity from Bearer token)

**Response:**
```ts
{
  recommendations: Array<{
    eventId: string;
    title: string;
    startDateTime: string;
    endDateTime: string;
    location?: string;
    isVirtual: boolean;
    tags: string[];
    relevanceScore: number;   // 0–1
    reason: string;           // "You often attend engineering meetups"
    myStatus: RsvpStatus | null;
  }>;
  personaInsight: string;     // "Based on your history: workshops, tech, Friday afternoons"
}
```

**Server logic:**
1. `requireAuth()` → `checkAIRateLimit()`
2. Query `eventResponses` where `userId == uid`, `status in [ATTENDING, UPCOMING]`, last 90 days → collect eventIds
3. Batch-fetch parent events in chunks of 30 → build tag frequency map
4. Query `events` where `isPublic == true`, `startDateTime >= now()`, ordered by date, limit 30 → candidate pool
5. Filter out events the user already has any response for
6. If tag frequency map is empty → return `{ recommendations: [], personaInsight: "" }`
7. Call Gemini (temperature 0.2) with tag frequency map + candidate list → rank top 5 with reason strings
8. Enrich AI results with full event data and return

**Gemini output shape:**
```ts
{
  recommendations: Array<{ eventId: string; relevanceScore: number; reason: string }>;
  personaInsight: string;
}
```

### No new Zod schema (GET, no body)

### Component
**File:** `src/components/ai/EventRecommendations.tsx`

**Behavior:**
- Auto-executes on mount via `useEffect` + `apiRequest` GET call
- If `recommendations` is empty → render nothing
- Renders a horizontal scroll row of up to 5 compact event cards
- Each card shows: title, date, virtual/location badge, colored relevance score badge
- shadcn `Tooltip` on the score badge shows the `reason` string on hover
- Above the row: muted badge showing `personaInsight`
- Skeleton cards while loading

**Props:** none (reads user from auth context)

### Page integration
`src/app/(dashboard)/events/page.tsx`:
```tsx
<NlpSearchBar />
<EventRecommendations />   {/* NEW — add here */}
<Tabs ...>
```

---

## Feature 3 — AI Agenda Builder

### What it does
One click generates a full time-blocked agenda (sessions, breaks, networking slots) based on the event's duration, type, and description. Result fills the description field.

### Where it appears
- `/events/create` — ghost button next to the existing `<DescriptionGenerator />` in the Description card
- `/events/[id]/edit` — same placement

### API route
`POST /api/ai/build-agenda`

**Request body:**
```ts
{
  title: string;
  description?: string;
  startDateTime: string;    // ISO
  endDateTime: string;      // ISO
  eventType: "conference" | "workshop" | "meetup" | "social" | "corporate" | "other";
  speakerCount?: number;
  includeBreaks: boolean;
}
```

**Response:**
```ts
{
  agenda: Array<{
    startOffset: number;    // minutes from event start
    endOffset: number;
    title: string;
    description: string;
    type: "session" | "break" | "networking" | "keynote" | "workshop" | "qa" | "closing";
    speaker?: string;
  }>;
  formattedText: string;   // markdown agenda ready to paste into description
}
```

**Server logic:**
1. `requireAuth()` → `checkAIRateLimit()`
2. Validate body with `BuildAgendaSchema`
3. Compute `durationMinutes` from start/end
4. Call Gemini (temperature 0.5, maxTokens 1500) — no Firestore queries needed
5. Return result

**Gemini prompt constraints:**
- Total agenda must span exactly `durationMinutes` (offset 0 → durationMinutes)
- No gaps, no overlaps
- Include breaks for events > 90 minutes (when `includeBreaks: true`)
- `formattedText` uses relative times (0:00, 0:30, 1:00…)

### New Zod schema
```ts
export const BuildAgendaSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    startDateTime: z.string().datetime(),
    endDateTime: z.string().datetime(),
    eventType: z
      .enum(["conference", "workshop", "meetup", "social", "corporate", "other"])
      .default("other"),
    speakerCount: z.number().int().min(1).max(50).optional(),
    includeBreaks: z.boolean().default(true),
  })
  .refine(
    (d) => new Date(d.endDateTime) > new Date(d.startDateTime),
    { message: "End time must be after start time" }
  );
```

### Component
**File:** `src/components/ai/AgendaBuilder.tsx`

**Props:**
```ts
{
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  onGenerated: (text: string) => void;  // same callback signature as DescriptionGenerator
}
```

**Disabled when:** `!startDateTime || !endDateTime`

**Dialog contents:**
- EventType `<Select>` (conference / workshop / meetup / social / corporate / other)
- Speaker count `<Input type="number">`
- Include Breaks `<Checkbox>`
- "Build Agenda" button → calls `useAI` → shows spinner
- On success: timeline list with colored type badges (break=gray, keynote=purple, networking=teal, etc.)
- "Use as Description" button → calls `onGenerated(formattedText)` and closes dialog

### Page integration
`src/app/(dashboard)/events/create/page.tsx` — in the Description label row:
```tsx
<div className="flex items-center justify-between">
  <Label htmlFor="description">Description</Label>
  <div className="flex gap-1">
    <DescriptionGenerator title={title} onGenerated={setDescription} />
    <AgendaBuilder
      title={title}
      description={description}
      startDateTime={startDateTime ? new Date(startDateTime).toISOString() : ""}
      endDateTime={endDateTime ? new Date(endDateTime).toISOString() : ""}
      onGenerated={setDescription}
    />
  </div>
</div>
```

Same pattern for `src/app/(dashboard)/events/[id]/edit/page.tsx`.

---

## Feature 4 — Attendance Prediction & Capacity Advisor

### What it does
AI predicts expected turnout range for an upcoming event based on historical similar events, and advises whether the `maxAttendees` cap is too tight, too loose, or well-calibrated.

### Where it appears
- `/events/[id]` — compact advisory Card between the RSVP section and Attendees list (owner only, future events only)
- `/events/create` — inline hint `<p>` below the `maxAttendees` input (renders after blur, no card wrapper)

### API route
`POST /api/ai/predict-attendance`

**Request body:**
```ts
{
  eventId?: string;
  title: string;
  tags: string[];
  startDateTime: string;
  endDateTime: string;
  isVirtual: boolean;
  maxAttendees?: number;
  currentInviteCount?: number;
}
```

**Response:**
```ts
{
  predictedAttendanceMin: number;
  predictedAttendanceMax: number;
  confidenceLevel: "low" | "medium" | "high";
  capacityAdvice: string;        // "Your cap of 15 looks tight — consider raising to 20"
  similarEventsCount: number;
  factors: string[];             // ["Friday evening", "popular 'engineering' tag"]
  recommendation: "raise_cap" | "lower_cap" | "cap_looks_good" | "set_a_cap" | "no_cap_needed";
}
```

**Server logic:**
1. `requireAuth()` → `checkAIRateLimit()`
2. Validate body with `PredictAttendanceSchema`
3. If `eventId` given: count `eventResponses` where `status in [ATTENDING, UPCOMING]` for current event
4. Query `events` where `tagNames array-contains-any tags`, `isVirtual == isVirtual`, `endDateTime <= now()`, limit 20 → similar past events
5. For each similar event: count `eventResponses` where `status == ATTENDING` → build `historicalData` array
6. Call Gemini (temperature 0.2) with historical data + event metadata → predict range + advice
7. Return result

### New Zod schema
```ts
export const PredictAttendanceSchema = z.object({
  eventId: z.string().min(1).max(128).optional(),
  title: z.string().min(1).max(200),
  tags: z.array(z.string().max(50)).max(10).default([]),
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
  isVirtual: z.boolean(),
  maxAttendees: z.number().int().positive().optional(),
  currentInviteCount: z.number().int().min(0).optional(),
});
```

### Component
**File:** `src/components/ai/AttendancePrediction.tsx`

**Props:**
```ts
{
  eventId?: string;
  title: string;
  tags: string[];
  startDateTime: string;
  endDateTime: string;
  isVirtual: boolean;
  maxAttendees?: number;
  currentInviteCount?: number;
  variant?: "card" | "inline";   // "card" for detail page, "inline" for create page
}
```

**Card variant (detail page):**
- Auto-executes on mount
- Renders shadcn `<Card>` with:
  - Predicted range headline: "Expected 8–14 attendees"
  - Confidence badge (low=gray, medium=yellow, high=green)
  - Capacity advice text
  - Factor chips (small badges)
  - Colored recommendation indicator: green=cap_looks_good, yellow=raise/lower, blue=set_a_cap

**Inline variant (create page):**
- Auto-executes when `maxAttendees` field loses focus
- Renders a simple `<p className="text-sm text-muted-foreground">` below the input

### Page integration

**`/events/[id]/page.tsx`** — between RSVP card and Attendees card:
```tsx
{event.isOwner && new Date(event.startDateTime) > new Date() && (
  <AttendancePrediction
    eventId={params.id}
    title={event.title}
    tags={event.tagNames}
    startDateTime={event.startDateTime}
    endDateTime={event.endDateTime}
    isVirtual={event.isVirtual}
    maxAttendees={event.maxAttendees}
    variant="card"
  />
)}
```

**`/events/create/page.tsx`** — below the maxAttendees input:
```tsx
{startDateTime && endDateTime && (
  <AttendancePrediction
    title={title}
    tags={tags.split(",").map(t => t.trim()).filter(Boolean)}
    startDateTime={new Date(startDateTime).toISOString()}
    endDateTime={new Date(endDateTime).toISOString()}
    isVirtual={isVirtual}
    maxAttendees={maxAttendees ? parseInt(maxAttendees) : undefined}
    variant="inline"
  />
)}
```

---

## Feature 5 — Voice-to-Event Creator ⭐

### What it does
User clicks a microphone button, speaks naturally ("Plan a 2-hour Python workshop for 20 engineers next Friday at 2pm, virtual on Zoom"), and Gemini automatically extracts all event fields and creates the event — no manual form filling required.

### Where it appears
- `/events` list page — "Voice" secondary button in the page header next to "+ Create Event"
- Opens a full-screen modal/sheet with the voice UI
- On success: redirects to the newly created event's detail page

### Speech-to-text approach
**Web Speech API** (`window.SpeechRecognition` / `window.webkitSpeechRecognition`) — browser-native, free, no extra API key.
Falls back to a `<Textarea>` for unsupported browsers.

### API route
`POST /api/ai/voice-create-event`

**Request body:**
```ts
{ transcript: string }
```

**Response — two possible shapes:**

Shape A (ready — all required fields resolved):
```ts
{
  status: "ready";
  extractedEvent: {
    title: string;
    description?: string;
    startDateTime: string;   // ISO — relative dates resolved against today
    endDateTime: string;
    location?: string;
    isVirtual: boolean;
    virtualLink?: string;
    maxAttendees?: number;
    isPublic: boolean;
    tagNames: string[];
  };
  summary: string;             // "Creating: Python Workshop · Fri Feb 28, 2pm–4pm · Virtual · 20 max"
  createdEventId: string;      // event already created by the API route
}
```

Shape B (needs clarification):
```ts
{
  status: "needs_clarification";
  extractedEvent: Partial<ExtractedEvent>;
  missingFields: string[];          // e.g. ["startDateTime", "title"]
  clarificationPrompt: string;      // e.g. "What date and time should this be?"
}
```

**Server logic:**
1. `requireAuth()` → `checkAIRateLimit()`
2. Validate body with `VoiceCreateEventSchema`
3. Call Gemini (temperature 0.2, maxTokens 800) to extract structured fields
4. If `status === "ready"`: write event to `events` collection via Admin SDK (same field shape as `POST /api/events`), set `createdById = user.uid`, `createdAt/updatedAt = now()`
5. Return shape A with `createdEventId`, or shape B with clarification prompt

**Gemini system prompt:**
```
You are an event extraction engine. Today is {ISO_DATE}.
Extract event details from the user's spoken description. Resolve all relative dates/times to ISO 8601 UTC.

Rules:
- If title, startDateTime, and endDateTime can be confidently resolved → status: "ready"
- If any required field is missing or ambiguous → status: "needs_clarification"
- isVirtual: true if user mentions Zoom, Teams, Meet, online, remote, virtual
- isPublic: true by default unless user says "private" or "invite-only"
- tagNames: infer 2–5 relevant tags from context
- endDateTime: if user gives duration ("2 hours"), add to start. If no end, default to start + 1 hour.
- description: synthesize a 2-sentence description from the user's words

Return JSON matching either Shape A or Shape B.
```

### New Zod schema
```ts
export const VoiceCreateEventSchema = z.object({
  transcript: z.string().min(5, "Say something about your event").max(1000),
});
```

### Component
**File:** `src/components/ai/VoiceEventCreator.tsx`

**Browser speech capture code pattern:**
```ts
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.lang = "en-US";
recognition.continuous = false;
recognition.interimResults = true;
recognition.onresult = (e) =>
  setTranscript(e.results[e.results.length - 1][0].transcript);
recognition.onerror = () =>
  setError("Microphone access denied or not supported");
```

**UI states:**
| State | UI |
|---|---|
| Idle | Mic button + "Create Event by Voice" label |
| Listening | Animated pulse ring · live transcript text · "Stop" button |
| Processing | Spinner + "Gemini is creating your event…" |
| Success (ready) | Green checkmark · `summary` string · "View Event →" link to `/events/{createdEventId}` |
| Clarification needed | Extracted partial fields shown · `clarificationPrompt` text · `<Textarea>` or second mic button for follow-up |
| Unsupported / error | `<Textarea>` fallback with "Type your event description instead" label |

**Props:** none (reads auth from context, uses `apiRequest` directly)

**Opened by:** Sheet/Dialog triggered from the events list page header button.

### Page integration
`src/app/(dashboard)/events/page.tsx` — in the header:
```tsx
<div className="flex items-center justify-between">
  <h1 className="text-2xl font-bold">Events</h1>
  <div className="flex gap-2">
    <VoiceEventCreator />          {/* NEW */}
    <Link href="/events/create">
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        Create Event
      </Button>
    </Link>
  </div>
</div>
```

---

## Feature 6 — Agentic Event Assistant (LangChain) ⭐⭐

### What it does
A persistent, multi-turn AI assistant that can autonomously plan, create, and manage events by orchestrating multiple tools in sequence — without the user needing to navigate between pages or fill forms. The user types or speaks a goal ("Schedule a quarterly review for my team, invite the usual people, and suggest a time that avoids conflicts") and the agent handles every step.

This is a **ReAct agent** (Reason + Act loop) built with LangChain, using Gemini as the backbone LLM and Firestore as the tool execution environment.

### Where it appears
- **Global:** Persistent chat button (bottom-right corner of every authenticated page) — opens a `<Sheet>` side panel
- Accessible from `/events`, `/events/[id]`, and `/events/create`

### New packages required
```bash
pnpm add @langchain/core @langchain/google-genai langchain
```

New env variable:
```env
# Already exists — reused by LangChain
GEMINI_API_KEY=""
```

---

### Architecture Overview

```
User message
     │
     ▼
POST /api/ai/agent
     │
     ├─ requireAuth() + checkAIRateLimit()
     ├─ Rebuild ChatMessageHistory from request body
     │
     ▼
AgentExecutor (LangChain ReAct)
  LLM: ChatGoogleGenerativeAI (gemini-2.5-flash)
  Tools: [
    searchEventsTool,
    createEventTool,
    getMyScheduleTool,
    checkConflictsTool,
    invitePeopleTool,
    predictAttendanceTool,
    buildAgendaTool,
  ]
     │
     ▼
Streamed or JSON response → client
```

The agent decides which tools to call, in what order, based on the user's message. It can chain multiple tool calls in a single response (e.g., getMySchedule → checkConflicts → createEvent → invitePeople).

---

### API route
`POST /api/ai/agent`

**Request body:**
```ts
{
  message: string;                          // current user message
  history: Array<{
    role: "user" | "assistant";
    content: string;
  }>;                                       // prior turns for multi-turn memory
}
```

**Response (non-streaming):**
```ts
{
  reply: string;                            // agent's final natural-language response
  toolsUsed: string[];                      // e.g. ["createEvent", "invitePeople"]
  actionsPerformed: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: string;
  }>;
  eventIds?: string[];                      // any event IDs created or referenced
}
```

**Server logic:**
1. `requireAuth()` → `checkAIRateLimit()`
2. Validate body with `AgentMessageSchema`
3. Instantiate `ChatGoogleGenerativeAI` with `gemini-2.5-flash`, `temperature: 0.3`
4. Build `ChatMessageHistory` from `history` array
5. Instantiate all tools (see Tools section below), each receiving `user.uid` via closure
6. Create `AgentExecutor` with `createReactAgent(llm, tools, prompt)`
7. Run `executor.invoke({ input: message, chat_history: history })`
8. Return structured response

### New Zod schema
```ts
export const AgentMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(20)
    .default([]),
});
```

---

### LangChain Agent Setup (`src/lib/agent.ts`)

```ts
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createReactAgent } from "langchain/agents";
import { pull } from "langchain/hub";
import { Tool } from "@langchain/core/tools";
import { ChatMessageHistory } from "langchain/memory";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

export async function createEventAgent(userId: string) {
  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    apiKey: process.env.GEMINI_API_KEY!,
    temperature: 0.3,
  });

  const tools = buildAgentTools(userId);  // see Tools section

  // Use the standard hwchase17/react prompt from LangChain hub
  const prompt = await pull("hwchase17/react");

  const agent = await createReactAgent({ llm, tools, prompt });

  return new AgentExecutor({
    agent,
    tools,
    maxIterations: 8,
    returnIntermediateSteps: true,
    verbose: process.env.NODE_ENV === "development",
  });
}

export function buildChatHistory(
  history: Array<{ role: "user" | "assistant"; content: string }>
) {
  return history.map((m) =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
  );
}
```

---

### Agent Tools (`src/lib/agent-tools.ts`)

Each tool is a LangChain `DynamicStructuredTool` that wraps existing Firestore queries and API logic. All tools receive `userId` via closure so they operate in the authenticated user's context.

#### Tool 1 — `searchEvents`
```ts
name: "searchEvents"
description: "Search for events by keyword, tag, or date range. Use this to find existing events."
schema: z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  filter: z.enum(["upcoming", "past", "all"]).default("upcoming"),
})
// Implementation: queries Firestore `events` collection
// Returns: array of { id, title, startDateTime, endDateTime, location, isVirtual, tags }
```

#### Tool 2 — `getMySchedule`
```ts
name: "getMySchedule"
description: "Get the current user's upcoming events and RSVPs for the next 30 days. Use this before scheduling to check for conflicts."
schema: z.object({
  days: z.number().int().min(1).max(90).default(30),
})
// Implementation: queries `eventResponses` where userId == uid, status in [ATTENDING, UPCOMING]
// Batch-fetches parent events
// Returns: array of { eventId, title, startDateTime, endDateTime, myStatus }
```

#### Tool 3 — `checkConflicts`
```ts
name: "checkConflicts"
description: "Check if a proposed time slot conflicts with the user's existing events."
schema: z.object({
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
})
// Implementation: reuses logic from /api/ai/check-conflicts route
// Returns: { hasConflict: boolean, conflicts: Array<{ title, startDateTime, endDateTime }> }
```

#### Tool 4 — `createEvent`
```ts
name: "createEvent"
description: "Create a new event in Firestore. Only call this after confirming the details with the user."
schema: z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
  location: z.string().max(500).optional(),
  isVirtual: z.boolean().default(false),
  virtualLink: z.string().url().optional(),
  maxAttendees: z.number().int().positive().optional(),
  isPublic: z.boolean().default(true),
  tagNames: z.array(z.string()).max(10).default([]),
})
// Implementation: writes directly to Firestore `events` collection via Admin SDK
// Sets createdById = userId, createdAt/updatedAt = now()
// Returns: { eventId: string, title: string, startDateTime: string }
```

#### Tool 5 — `invitePeople`
```ts
name: "invitePeople"
description: "Send invitations to people by email for a specific event."
schema: z.object({
  eventId: z.string(),
  emails: z.array(z.string().email()).min(1).max(50),
  message: z.string().max(1000).optional(),
})
// Implementation: calls existing invitation creation logic (same as POST /api/events/[id]/invite)
// Returns: { invited: number, emails: string[] }
```

#### Tool 6 — `suggestMeetingTime`
```ts
name: "suggestMeetingTime"
description: "Suggest optimal time slots for a meeting given attendee IDs and a preferred date range."
schema: z.object({
  attendeeIds: z.array(z.string()).min(1).max(20),
  preferredDateFrom: z.string().datetime(),
  preferredDateTo: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
})
// Implementation: reuses logic from /api/ai/suggest-time route
// Returns: Array<{ startDateTime, endDateTime, score, reason }>
```

#### Tool 7 — `buildAgenda`
```ts
name: "buildAgenda"
description: "Generate a time-blocked agenda for an event given its duration and type."
schema: z.object({
  title: z.string(),
  durationMinutes: z.number().int().min(15).max(480),
  eventType: z.enum(["conference","workshop","meetup","social","corporate","other"]).default("other"),
  speakerCount: z.number().int().min(1).max(50).default(1),
})
// Implementation: calls callGemini() with agenda prompt (same as /api/ai/build-agenda)
// Returns: { agenda: AgendaItem[], formattedText: string }
```

---

### Agent System Prompt

The agent is initialized with a system prompt that scopes its behavior to the app:

```
You are an intelligent event scheduling assistant for Aspire, an event management app.
Today is {ISO_DATE}. The current user's ID is {USER_ID}.

You help users:
- Plan and create events
- Check their schedule and find available times
- Invite people to events
- Build agendas
- Search for relevant events

ALWAYS:
- Confirm destructive actions (creating events, sending invitations) before calling the tool
- Resolve relative dates ("next Friday", "tomorrow") against today's date: {ISO_DATE}
- Be concise — one short paragraph per response unless showing structured data
- If you created an event, include its ID in your final response so the UI can surface a link

NEVER invent email addresses, user IDs, or event IDs.
```

---

### Component
**File:** `src/components/ai/EventAssistant.tsx`

**Placement:** Fixed bottom-right corner of the dashboard layout (`src/app/(dashboard)/layout.tsx`).

**Trigger:** Floating circular button with a `<Bot>` icon from lucide-react. Clicking opens a shadcn `<Sheet side="right">` with the chat interface.

**Chat UI anatomy:**
```
┌──────────────────────────────┐
│  Event Assistant          [X] │
│  Powered by Gemini + LangChain│
├──────────────────────────────┤
│                               │
│  [Assistant bubble]           │
│  Hi! I can create events,     │
│  check your schedule, and     │
│  invite people. What would    │
│  you like to do?              │
│                               │
│           [User bubble]       │
│  Schedule a Python workshop   │
│  next Friday for 20 people    │
│                               │
│  [Assistant bubble]           │
│  I'll check your schedule     │
│  first...                     │
│                               │
│  ── Tools used ──────────── │
│  ✓ getMySchedule              │
│  ✓ checkConflicts             │
│  ✓ createEvent → ev_abc123    │
│  ─────────────────────────── │
│                               │
│  Done! Created "Python        │
│  Workshop" for Friday Mar 7,  │
│  2pm–4pm. [View Event →]     │
│                               │
├──────────────────────────────┤
│ [Type a message...] [Send]    │
└──────────────────────────────┘
```

**State:**
```ts
interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  eventIds?: string[];
  timestamp: Date;
}
```

**Behavior:**
- Messages are kept in local `useState` (no persistence — session-only)
- On send: append user message, call `POST /api/ai/agent` with full history, append assistant reply
- If response includes `eventIds`, render "View Event →" links inline in the assistant bubble
- "Tools used" section is collapsible (collapsed by default)
- Typing indicator (animated dots) while waiting for response
- Error state shows a "Try again" button

**Props:** none (reads auth from context)

### Layout integration
`src/app/(dashboard)/layout.tsx`:
```tsx
import { EventAssistant } from "@/components/ai/EventAssistant";

export default function DashboardLayout({ children }) {
  return (
    <div>
      <Header />
      <main>{children}</main>
      <EventAssistant />   {/* NEW — renders fixed FAB + Sheet */}
    </div>
  );
}
```

---

---

## Implementation Checklist

### Dependencies
- [ ] Install `@langchain/core`, `@langchain/google-genai`, `langchain` via pnpm

### Validators (`src/lib/validators.ts`)
- [ ] Add `GenerateRecapSchema`
- [ ] Add `BuildAgendaSchema`
- [ ] Add `PredictAttendanceSchema`
- [ ] Add `VoiceCreateEventSchema`
- [ ] Add `AgentMessageSchema`

### Types (`src/types/firestore.ts`)
- [ ] Add optional `recap?` field to `EventDoc`

### API Routes — create new files
- [ ] `src/app/api/ai/generate-recap/route.ts`
- [ ] `src/app/api/ai/recommendations/route.ts`
- [ ] `src/app/api/ai/build-agenda/route.ts`
- [ ] `src/app/api/ai/predict-attendance/route.ts`
- [ ] `src/app/api/ai/voice-create-event/route.ts`
- [ ] `src/app/api/ai/agent/route.ts`

### LangChain Agent Library — create new files
- [ ] `src/lib/agent.ts` — `createEventAgent()` factory
- [ ] `src/lib/agent-tools.ts` — all 7 `DynamicStructuredTool` definitions

### Components — create new files
- [ ] `src/components/ai/AgendaBuilder.tsx`
- [ ] `src/components/ai/EventRecommendations.tsx`
- [ ] `src/components/ai/VoiceEventCreator.tsx`
- [ ] `src/components/ai/AttendancePrediction.tsx`
- [ ] `src/components/ai/EventRecapGenerator.tsx`
- [ ] `src/components/ai/EventAssistant.tsx`

### Page Integration — modify existing files
- [ ] `src/app/(dashboard)/layout.tsx` — mount `<EventAssistant />` globally
- [ ] `src/app/(dashboard)/events/page.tsx` — add `<EventRecommendations />` + Voice button in header
- [ ] `src/app/(dashboard)/events/create/page.tsx` — add `<AgendaBuilder />` + `<AttendancePrediction variant="inline" />`
- [ ] `src/app/(dashboard)/events/[id]/page.tsx` — add `<AttendancePrediction variant="card" />` + `<EventRecapGenerator />`
- [ ] `src/app/(dashboard)/events/[id]/edit/page.tsx` — add `<AgendaBuilder />`

---

## Verification Checklist

### Feature 1 — Post-Event Recap Generator
- [ ] "Generate Recap" button is visible on a past event the user owns
- [ ] Button is hidden on future events and events the user does not own
- [ ] Clicking the button calls the API and shows a loading state
- [ ] All four dialog tabs populate: Summary, Highlights, Follow-Ups, Shareable Text
- [ ] "Copy" button copies the shareable text to clipboard
- [ ] Recap is cached: reopening the dialog does not call the API a second time

### Feature 2 — Personalized Recommendations
- [ ] "Events For You" row appears on `/events` when the user has RSVP history
- [ ] Row is hidden when the user has no history (no error, no empty state)
- [ ] Up to 5 event cards render in a horizontal scroll row
- [ ] Hovering the relevance badge shows the `reason` tooltip
- [ ] `personaInsight` badge is visible above the row
- [ ] Skeleton cards show while loading

### Feature 3 — AI Agenda Builder
- [ ] "Build Agenda" ghost button appears next to "AI Generate" in Description row
- [ ] Button is disabled when `startDateTime` or `endDateTime` is empty
- [ ] Dialog renders EventType select, speaker count input, and breaks toggle
- [ ] Generated timeline renders with colored type badges (break / keynote / networking / etc.)
- [ ] "Use as Description" fills the description textarea and closes the dialog
- [ ] Same button present on the edit page (`/events/[id]/edit`)

### Feature 4 — Attendance Prediction & Capacity Advisor
- [ ] Prediction card renders between RSVP and Attendees sections on a future event the user owns
- [ ] Card shows predicted range, confidence badge, advice text, and factor chips
- [ ] Recommendation indicator color matches status (green / yellow / blue)
- [ ] Inline hint renders below `maxAttendees` input on the create page
- [ ] Neither variant renders on past events or events the user does not own

### Feature 5 — Voice-to-Event Creator
- [ ] "Voice" button appears in the `/events` page header
- [ ] Clicking opens a Sheet with the voice UI
- [ ] Mic button starts listening; animated pulse ring and live transcript appear
- [ ] "Stop" button ends recording
- [ ] Speaking "Team lunch tomorrow at noon for 10 people" creates an event and shows the summary
- [ ] "View Event →" link redirects to the new event's detail page
- [ ] Clarification UI shows when required fields are missing
- [ ] Textarea fallback appears on browsers that do not support Web Speech API

### Feature 6 — LangChain Agentic Assistant
- [ ] Bot FAB is visible on every authenticated page (bottom-right)
- [ ] Clicking opens the chat Sheet
- [ ] Typing "Create a 1-hour team standup tomorrow at 9am" makes the agent call `checkConflicts` then `createEvent`
- [ ] A "View Event →" link appears in the assistant reply
- [ ] "Tools used" section is collapsible and lists every tool called
- [ ] Multi-step test: "Schedule a workshop next Friday and invite jane@example.com" calls `getMySchedule`, `createEvent`, and `invitePeople` in sequence
- [ ] Typing indicator (animated dots) shows while the agent is thinking
- [ ] Error state shows "Try again" button on API failure
- [ ] Rate limit error is surfaced gracefully in the chat bubble
