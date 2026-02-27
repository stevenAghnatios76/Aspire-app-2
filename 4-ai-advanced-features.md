# AI Advanced Features — Implementation Guide

> Phased implementation of 6 advanced AI features for Aspire App 2. Features 1–5 are implemented. Feature 6 is deferred pending Zod v4 + LangChain compatibility.

---

## Implementation Status

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Post-Event Recap Generator | Phase 1 | ✅ Implemented |
| 2 | Personalized Event Recommendations | Phase 2 | ✅ Implemented |
| 3 | AI Agenda Builder | Phase 1 | ✅ Implemented |
| 4 | Attendance Prediction & Capacity Advisor | Phase 2 | ✅ Implemented |
| 5 | Voice-to-Event Creator | Phase 3 | ✅ Implemented |
| 6 | Agentic Event Assistant (LangChain) | Phase 4 | ⏳ Deferred |

---

## Completed Implementation Checklist

### Validators (`src/lib/validators.ts`)
- [x] `BuildAgendaSchema` — with `.refine()` for end > start
- [x] `GenerateRecapSchema` — eventId + includeAttendeeNames
- [x] `PredictAttendanceSchema` — event metadata + optional eventId
- [x] `VoiceCreateEventSchema` — transcript string (min 5, max 1000)

### Types (`src/types/firestore.ts`)
- [x] `EventRecap` interface added
- [x] Optional `recap?` field added to `EventDoc`

### API Routes Created
- [x] `src/app/api/ai/build-agenda/route.ts` — POST, Gemini agenda generation (temp 0.5, 1500 tokens)
- [x] `src/app/api/ai/generate-recap/route.ts` — POST, attendance analysis + Firestore caching (temp 0.6, 1200 tokens)
- [x] `src/app/api/ai/recommendations/route.ts` — GET, tag-frequency ranking of upcoming public events (temp 0.2)
- [x] `src/app/api/ai/predict-attendance/route.ts` — POST, historical similarity analysis (temp 0.2)
- [x] `src/app/api/ai/voice-create-event/route.ts` — POST, transcript extraction + auto event creation (temp 0.2, 800 tokens)

### Components Created
- [x] `src/components/ai/AgendaBuilder.tsx` — Dialog with event type, speakers, breaks; timeline preview + "Use as Description"
- [x] `src/components/ai/EventRecapGenerator.tsx` — 4-tab dialog (Summary, Highlights, Follow-Ups, Share); cached recap support
- [x] `src/components/ai/EventRecommendations.tsx` — horizontal scroll card row with relevance tooltips + persona insight badge
- [x] `src/components/ai/AttendancePrediction.tsx` — "card" variant (detail page) + "inline" variant (create page)
- [x] `src/components/ai/VoiceEventCreator.tsx` — Web Speech API state machine with textarea fallback
- [x] `src/components/ui/tooltip.tsx` — shadcn tooltip (added for recommendations)

### Page Integrations Modified
- [x] `src/app/(dashboard)/events/page.tsx` — `<EventRecommendations />` between search and tabs; `<VoiceEventCreator />` in header
- [x] `src/app/(dashboard)/events/create/page.tsx` — `<AgendaBuilder />` next to DescriptionGenerator; `<AttendancePrediction variant="inline" />` below maxAttendees
- [x] `src/app/(dashboard)/events/[id]/page.tsx` — `<AttendancePrediction variant="card" />` between RSVP and Attendees; `<EventRecapGenerator />` after Invitee Suggestions (past events, owner only)
- [x] `src/app/(dashboard)/events/[id]/edit/page.tsx` — `<AgendaBuilder />` next to DescriptionGenerator

---

## Verification Checklists

### Feature 1 — Post-Event Recap Generator
- [ ] "Generate Recap" button is visible on a past event the user owns
- [ ] Button is hidden on future events and events the user does not own
- [ ] Clicking the button calls the API and shows a loading spinner
- [ ] All four dialog tabs populate: Summary, Highlights, Follow-Ups, Shareable Text
- [ ] Attendance stats grid (attended, invited, rate, declined) renders in Summary tab
- [ ] "Copy" button copies the shareable text to clipboard
- [ ] Recap is cached: reopening shows "View Recap" button and loads instantly without API call
- [ ] "Include attendee names" checkbox works and changes the recap content
- [ ] 403 returned when non-owner tries to generate
- [ ] 400 returned when event hasn't ended yet

### Feature 2 — Personalized Recommendations
- [ ] "Events For You" row appears on `/events` when the user has RSVP history (last 90 days)
- [ ] Row is hidden when the user has no history (no error, no empty state — returns `null`)
- [ ] Up to 5 event cards render in a horizontal scroll row
- [ ] Each card shows title, date, virtual/location indicator, and tag badges
- [ ] Hovering the relevance percentage badge shows the `reason` tooltip
- [ ] `personaInsight` badge is visible above the row (e.g., "You enjoy tech workshops")
- [ ] Skeleton cards show while loading
- [ ] Cards link to `/events/{eventId}`
- [ ] Already-responded events are filtered out of recommendations

### Feature 3 — AI Agenda Builder
- [ ] "Build Agenda" ghost button appears next to "AI Generate" in Description label row
- [ ] Button is disabled when `startDateTime` or `endDateTime` is empty
- [ ] Dialog renders: EventType Select (6 options), Speaker Count input, Include Breaks checkbox
- [ ] "Build Agenda" button calls API and shows loading spinner
- [ ] Generated timeline renders with colored type badges (session=blue, break=gray, keynote=purple, networking=teal, qa=green, closing=amber)
- [ ] Each item shows time offset range, title, description, and optional speaker
- [ ] "Use as Description" fills the description textarea and closes the dialog
- [ ] Same button is present on the edit page (`/events/[id]/edit`)
- [ ] Agenda spans exactly the event duration (no gaps, no overlaps)

### Feature 4 — Attendance Prediction & Capacity Advisor
- [ ] **Card variant** renders between RSVP and Attendees sections on event detail page
- [ ] Card is only visible when: user is owner AND event is in the future
- [ ] Card shows predicted range (e.g., "45–65"), confidence badge (low/medium/high), capacity advice text
- [ ] Factor chips render (e.g., "Popular 'engineering' tag", "Friday evening")
- [ ] "Based on N similar past events" footer text renders
- [ ] **Inline variant** renders below `maxAttendees` input on create page
- [ ] Inline variant auto-fires when title + dates are filled
- [ ] Inline shows one-line summary (e.g., "Expected 8–14 attendees · Your cap looks right")
- [ ] Neither variant renders on past events or non-owned events
- [ ] Firestore queries: `array-contains-any` on tags, then filters `isVirtual` + past dates in app code

### Feature 5 — Voice-to-Event Creator
- [ ] "Voice" outline button with Mic icon appears in `/events` page header (before "Create Event")
- [ ] Clicking opens a bottom Sheet with the voice UI
- [ ] **Speech supported browsers:** Mic button starts listening; animated pulse ring appears
- [ ] Live transcript preview shows while speaking
- [ ] "Stop & Process" button ends recording and submits
- [ ] **Successful creation:** Green checkmark + summary string + "View Event →" link
- [ ] Event is actually created in Firestore with correct `createdById`
- [ ] An `eventResponse` with status `UPCOMING` is also created for the creator
- [ ] **Clarification flow:** Partial fields shown as badges, `clarificationPrompt` displayed, second mic/textarea input available
- [ ] Follow-up submission appends prior context to new transcript
- [ ] **Unsupported browsers:** Textarea fallback shows immediately with helpful placeholder
- [ ] **Error state:** Error message + textarea fallback + "Try again" button
- [ ] Enter key in textarea submits (Shift+Enter for newline)
- [ ] Sheet resets state when closed and reopened

---

## Phase 4 (Deferred) — Feature 6: Agentic Event Assistant (LangChain)

### Blocker
The project uses **Zod v4** (`^4.3.6`). LangChain's `DynamicStructuredTool` schemas depend on **Zod v3**. This creates a type incompatibility. Resolution options:
1. Wait for LangChain to add Zod v4 support
2. Use `zod-to-json-schema` bridge adapter
3. Downgrade project to Zod v3 (not recommended — would require updating all existing schemas)

### New Packages Required
```bash
pnpm add @langchain/core @langchain/google-genai langchain
```

### New Zod Schema
Add to `src/lib/validators.ts`:
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

### New Files to Create

#### `src/lib/agent.ts` — Agent Factory
- `createEventAgent(userId: string)` — instantiates `ChatGoogleGenerativeAI` (gemini-2.5-flash, temp 0.3), builds 7 tools via `buildAgentTools(userId)`, pulls `hwchase17/react` prompt from LangChain hub, creates `AgentExecutor` with `maxIterations: 8` and `returnIntermediateSteps: true`
- `buildChatHistory(history)` — maps `{ role, content }[]` to `HumanMessage` / `AIMessage` instances

#### `src/lib/agent-tools.ts` — 7 DynamicStructuredTool Definitions
All tools receive `userId` via closure for authenticated Firestore access.

| # | Tool Name | Description | Implementation |
|---|-----------|-------------|----------------|
| 1 | `searchEvents` | Search events by keyword, tag, date range | Queries Firestore `events` collection |
| 2 | `getMySchedule` | User's upcoming events for next N days | Queries `eventResponses` where userId + status in [ATTENDING, UPCOMING] |
| 3 | `checkConflicts` | Check proposed time slot for conflicts | Reuses `/api/ai/check-conflicts` logic |
| 4 | `createEvent` | Create event in Firestore (confirm first) | Admin SDK write to `events` collection |
| 5 | `invitePeople` | Send invitations by email | Reuses `/api/events/[id]/invite` logic |
| 6 | `suggestMeetingTime` | Suggest optimal times for a meeting | Reuses `/api/ai/suggest-time` logic |
| 7 | `buildAgenda` | Generate time-blocked agenda | Reuses `callGemini()` with agenda prompt |

**Tool schemas (Zod v3-compatible once blocker resolved):**

```ts
// Tool 1 — searchEvents
z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  filter: z.enum(["upcoming", "past", "all"]).default("upcoming"),
})

// Tool 2 — getMySchedule
z.object({
  days: z.number().int().min(1).max(90).default(30),
})

// Tool 3 — checkConflicts
z.object({
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
})

// Tool 4 — createEvent
z.object({
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

// Tool 5 — invitePeople
z.object({
  eventId: z.string(),
  emails: z.array(z.string().email()).min(1).max(50),
  message: z.string().max(1000).optional(),
})

// Tool 6 — suggestMeetingTime
z.object({
  attendeeIds: z.array(z.string()).min(1).max(20),
  preferredDateFrom: z.string().datetime(),
  preferredDateTo: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
})

// Tool 7 — buildAgenda
z.object({
  title: z.string(),
  durationMinutes: z.number().int().min(15).max(480),
  eventType: z.enum(["conference","workshop","meetup","social","corporate","other"]).default("other"),
  speakerCount: z.number().int().min(1).max(50).default(1),
})
```

### Agent System Prompt
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

#### `src/app/api/ai/agent/route.ts` — API Route
```
POST /api/ai/agent

Request body:
{
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

Response:
{
  reply: string;
  toolsUsed: string[];
  actionsPerformed: Array<{ tool: string; input: Record<string, unknown>; output: string }>;
  eventIds?: string[];
}

Server logic:
1. requireAuth() → checkAIRateLimit()
2. Validate body with AgentMessageSchema
3. Instantiate ChatGoogleGenerativeAI (gemini-2.5-flash, temp 0.3)
4. Build ChatMessageHistory from history array
5. Instantiate all 7 tools with user.uid via closure
6. Create AgentExecutor via createReactAgent(llm, tools, prompt)
7. Run executor.invoke({ input: message, chat_history: history })
8. Extract toolsUsed + actionsPerformed from intermediate steps
9. Return structured response
```

#### `src/components/ai/EventAssistant.tsx` — Chat UI Component

**Placement:** Fixed bottom-right corner of dashboard layout

**Trigger:** Floating circular `<Button>` with `<Bot>` lucide icon. Opens `<Sheet side="right">`

**Chat UI structure:**
```
┌──────────────────────────────┐
│  Event Assistant          [X] │
│  Powered by Gemini + LangChain│
├──────────────────────────────┤
│                               │
│  [Assistant bubble]           │
│  Hi! I can create events,     │
│  check your schedule, and     │
│  invite people.               │
│                               │
│           [User bubble]       │
│  Schedule a Python workshop   │
│  next Friday for 20 people    │
│                               │
│  ── Tools used ──────────── │
│  ✓ getMySchedule              │
│  ✓ checkConflicts             │
│  ✓ createEvent → ev_abc123    │
│  ─────────────────────────── │
│                               │
│  Done! Created "Python        │
│  Workshop" [View Event →]     │
│                               │
├──────────────────────────────┤
│ [Type a message...] [Send]    │
└──────────────────────────────┘
```

**State interface:**
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
- Messages in local `useState` (session-only, no persistence)
- On send: append user message → call `POST /api/ai/agent` with full history → append assistant reply
- If `eventIds` in response → render "View Event →" inline links
- "Tools used" section is collapsible (collapsed by default)
- Animated typing indicator (3 dots) while waiting for response
- Error state shows "Try again" button
- Rate limit errors surfaced as chat bubble

**Props:** none (reads auth from context)

### Page Integration
`src/app/(dashboard)/layout.tsx`:
```tsx
import { EventAssistant } from "@/components/ai/EventAssistant";

export default function DashboardLayout({ children }) {
  return (
    <div>
      <Header />
      <main>{children}</main>
      <EventAssistant />   {/* Renders fixed FAB + Sheet */}
    </div>
  );
}
```

### Feature 6 Implementation Checklist
- [ ] Resolve Zod v4 / LangChain Zod v3 compatibility blocker
- [ ] Install `@langchain/core`, `@langchain/google-genai`, `langchain` via pnpm
- [ ] Add `AgentMessageSchema` to `src/lib/validators.ts`
- [ ] Create `src/lib/agent-tools.ts` — 7 `DynamicStructuredTool` definitions
- [ ] Create `src/lib/agent.ts` — `createEventAgent()` factory + `buildChatHistory()`
- [ ] Create `src/app/api/ai/agent/route.ts` — POST route handler
- [ ] Create `src/components/ai/EventAssistant.tsx` — chat UI with floating FAB
- [ ] Mount `<EventAssistant />` in `src/app/(dashboard)/layout.tsx`

### Feature 6 Verification Checklist
- [ ] Bot FAB is visible on every authenticated page (bottom-right)
- [ ] Clicking opens the chat Sheet
- [ ] Typing "Create a 1-hour team standup tomorrow at 9am" makes the agent call `checkConflicts` then `createEvent`
- [ ] A "View Event →" link appears in the assistant reply
- [ ] "Tools used" section is collapsible and lists every tool called
- [ ] Multi-step test: "Schedule a workshop next Friday and invite jane@example.com" calls `getMySchedule`, `createEvent`, and `invitePeople` in sequence
- [ ] Typing indicator (animated dots) shows while the agent is thinking
- [ ] Error state shows "Try again" button on API failure
- [ ] Rate limit error is surfaced gracefully in the chat bubble
- [ ] Agent does NOT execute destructive actions without confirming with the user first
- [ ] Chat history persists within the session (cleared on page refresh)

---

## Architecture Notes

### Pattern Consistency
All new features follow the established app patterns:
- **API routes:** `requireAuth()` → `checkAIRateLimit()` → Zod `safeParse()` → Firestore queries → `callGemini<T>()` → `NextResponse.json()`
- **Client hooks:** `useAI<TReq, TRes>(endpoint)` for POST routes; `apiRequest<T>()` for GET routes
- **Error handling:** 401 (auth), 400 (validation), 429 (rate limit), 502 (Gemini failure)
- **Components:** `"use client"`, shadcn/ui primitives, lucide-react icons

### Firestore Query Strategies
- **Recommendations (Feature 2):** Uses existing composite index `events: isPublic + startDateTime` for candidate pool
- **Attendance Prediction (Feature 4):** Uses `array-contains-any` on tags, then filters `isVirtual` and past dates in application code (avoids unsupported Firestore composite of `array-contains-any` + inequality on different fields)
- **Recap (Feature 1):** Caches result on `events/{id}.recap` to avoid redundant Gemini calls

### Env Variables
No new env variables required — all features reuse the existing `GEMINI_API_KEY`.
