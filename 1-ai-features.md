# AI Features — Event Scheduler Application

> Intelligent capabilities powered by Google Gemini 1.5 Pro to enhance event scheduling, discovery, and management.

---

## Overview

All AI endpoints live under `/api/ai/*` and require authentication. Each endpoint calls the Gemini API with structured prompts and returns typed responses. A shared Gemini client is configured in `src/lib/gemini.ts`.

### Shared Setup

```typescript
// src/lib/gemini.ts
import { GoogleGenerativeAI } from "@google/generative-ai";

export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
export const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
```

### Rate Limiting

AI endpoints are rate-limited per user to control costs:

| Plan | Requests / minute | Requests / day |
|------|-------------------|----------------|
| Free | 5 | 50 |
| Premium | 20 | 500 |

Implementation: Use an in-memory store (e.g., `Map<userId, timestamps[]>`) for MVP, upgrade to Redis for production.

---

## Feature 1: Smart Scheduling — Optimal Time Suggestions

### Description

When creating an event, users can request AI to suggest the best time slots based on:
- Invited attendees' existing event schedules (conflicts)
- Historical attendance patterns (e.g., "this group typically meets on Tuesdays at 10am")
- General best-practice heuristics (avoid lunch hours, late evenings, weekends unless specified)

### API Endpoint

#### `POST /api/ai/suggest-time`

**Auth**: Required

**Request Body**

```json
{
  "title": "Sprint Planning",
  "attendeeIds": ["clu1", "clu2", "clu3"],
  "preferredDateRange": {
    "from": "2026-03-09T00:00:00.000Z",
    "to": "2026-03-13T23:59:59.000Z"
  },
  "durationMinutes": 60,
  "preferences": {
    "avoidWeekends": true,
    "preferMorning": true,
    "timezone": "America/New_York"
  }
}
```

**Validation (Zod)**

```typescript
const SuggestTimeSchema = z.object({
  title: z.string().min(1).max(200),
  attendeeIds: z.array(z.string()).min(1).max(50),
  preferredDateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  durationMinutes: z.number().int().min(15).max(480),
  preferences: z.object({
    avoidWeekends: z.boolean().default(true),
    preferMorning: z.boolean().default(false),
    timezone: z.string().default("UTC"),
  }).optional(),
});
```

**Data Flow**

```
1. Validate request
2. Fetch existing events for all attendeeIds in the date range:
   → Query the eventResponses collection:
     adminDb.collection('eventResponses')
       .where('userId', 'in', attendeeIds)     // batched if > 30
       .where('status', 'in', ['ATTENDING', 'UPCOMING'])
       .where('eventStartDateTime', '>=', dateFrom)
       .where('eventStartDateTime', '<=', dateTo)
   → Batch-read the corresponding event documents for full details
3. Build a "busy slots" matrix for each attendee
4. Construct OpenAI prompt:
   - System: "You are a scheduling assistant. Given attendee availability
     and preferences, suggest 3 optimal time slots."
   - User: JSON with busy slots, duration, preferences
5. Parse OpenAI structured response (JSON mode)
6. Return ranked suggestions
```

**OpenAI Prompt (System)**

```
You are a smart scheduling assistant for an event management application.
Given the following information:
- Event title and duration
- A list of attendees with their busy time slots
- User preferences (morning/afternoon, avoid weekends, timezone)

Suggest exactly 3 optimal time slots ranked by suitability.
For each suggestion, provide:
- startDateTime and endDateTime in ISO 8601 UTC
- A confidence score (0-1) based on how many attendees are free
- A brief reason explaining why this slot is good

Respond ONLY with valid JSON matching this schema:
{
  "suggestions": [
    {
      "startDateTime": "ISO string",
      "endDateTime": "ISO string",
      "confidence": 0.95,
      "reason": "string",
      "availableAttendees": ["userId1", "userId2"],
      "conflictedAttendees": ["userId3"]
    }
  ]
}
```

**Response — 200 OK**

```json
{
  "suggestions": [
    {
      "startDateTime": "2026-03-10T09:00:00.000Z",
      "endDateTime": "2026-03-10T10:00:00.000Z",
      "confidence": 0.95,
      "reason": "All 3 attendees are free. Tuesday mornings historically have highest attendance for this group.",
      "availableAttendees": ["clu1", "clu2", "clu3"],
      "conflictedAttendees": []
    },
    {
      "startDateTime": "2026-03-11T14:00:00.000Z",
      "endDateTime": "2026-03-11T15:00:00.000Z",
      "confidence": 0.67,
      "reason": "2 of 3 attendees are free. Alice has a conflicting meeting.",
      "availableAttendees": ["clu2", "clu3"],
      "conflictedAttendees": ["clu1"]
    },
    {
      "startDateTime": "2026-03-12T10:00:00.000Z",
      "endDateTime": "2026-03-12T11:00:00.000Z",
      "confidence": 0.60,
      "reason": "2 of 3 attendees free. Thursday morning is less popular for this group historically.",
      "availableAttendees": ["clu1", "clu3"],
      "conflictedAttendees": ["clu2"]
    }
  ]
}
```

**Error Responses**

| Status | Condition |
|--------|-----------|
| 400 | Validation failed |
| 401 | Not authenticated |
| 429 | Rate limit exceeded |
| 502 | OpenAI API error |

---

## Feature 2: Event Description Generator

### Description

Given a title and basic details (type, audience, formality level), the AI generates a polished, professional event description. Supports different tones: formal, casual, fun, corporate.

### API Endpoint

#### `POST /api/ai/generate-description`

**Auth**: Required

**Request Body**

```json
{
  "title": "Q1 All-Hands Meeting",
  "eventType": "corporate",
  "details": "Quarterly company update, CEO presenting Q1 results, followed by Q&A",
  "tone": "professional",
  "maxLength": 500
}
```

**Validation (Zod)**

```typescript
const GenerateDescriptionSchema = z.object({
  title: z.string().min(1).max(200),
  eventType: z.enum(["corporate", "social", "workshop", "meetup", "party", "conference", "other"]).optional(),
  details: z.string().max(1000).optional(),
  tone: z.enum(["professional", "casual", "fun", "formal"]).default("professional"),
  maxLength: z.number().int().min(50).max(2000).default(500),
});
```

**Data Flow**

```
1. Validate request
2. Construct OpenAI prompt with title, type, details, tone, length
3. Call OpenAI chat completions (temperature: 0.7 for creativity)
4. Return generated description + optional alternatives
```

**OpenAI Prompt (System)**

```
You are a professional event copywriter. Generate an engaging event description
based on the provided details.

Rules:
- Match the requested tone exactly
- Stay within the specified maximum character length
- Include a compelling opening line
- Mention key details (what, when context, who it's for)
- End with a call-to-action (e.g., "RSVP now", "Don't miss out")
- Do NOT invent specific dates/times/locations — only use what's provided

Return JSON:
{
  "description": "The generated description text",
  "alternates": ["A shorter variant", "A more casual variant"]
}
```

**Response — 200 OK**

```json
{
  "description": "Join us for the Q1 All-Hands Meeting — your front-row seat to our company's biggest wins and boldest plans for the year ahead. CEO Sarah Chen will present our Q1 results, highlighting key achievements across every department. Stick around for an open Q&A session where your questions drive the conversation. Whether you're celebrating milestones or shaping what's next, this is a meeting you won't want to miss. RSVP now to secure your spot.",
  "alternates": [
    "Q1 All-Hands: Get the latest company updates straight from the CEO. Q1 results, team highlights, and open Q&A. Be there.",
    "It's that time again! 🎉 Join the whole crew for our quarterly check-in. CEO's got the numbers, you've got the questions. Let's go!"
  ]
}
```

---

## Feature 3: Intelligent Search (NLP Query)

### Description

Users can search for events using natural language instead of structured filters. The AI parses intent from a free-text query and converts it into structured search parameters, then executes the search.

### API Endpoint

#### `GET /api/ai/search?q={natural language query}`

**Auth**: Required

**Query Parameters**

| Param | Type | Example |
|-------|------|---------|
| `q` | `string` | `"team lunches next week near downtown"` |
| `page` | `int` | 1 |
| `limit` | `int` | 20 |

**Data Flow**

```
1. Validate query exists and is ≤ 500 characters
2. Send query to OpenAI for intent extraction:
   → "Parse this event search query into structured filters"
3. OpenAI returns structured filters:
   {
     "keywords": ["team", "lunch"],
     "dateFrom": "2026-03-02T00:00:00Z",
     "dateTo": "2026-03-06T23:59:59Z",
     "location": "downtown",
     "tags": ["social", "food"],
     "isVirtual": false
   }
4. Execute structured search against the database (reuse search logic from core)
5. Return search results with the parsed filters for transparency
```

**OpenAI Prompt (System)**

```
You are a search query parser for an event scheduling application.
Today's date is {currentDate}.

Parse the user's natural-language search into structured filters.
Interpret relative dates ("next week", "this Friday", "in March") based on today's date.
Infer likely tags/categories from context clues.

Return ONLY valid JSON:
{
  "keywords": ["string"],       // search terms for title/description
  "dateFrom": "ISO or null",    // start of date range
  "dateTo": "ISO or null",      // end of date range
  "location": "string or null", // location filter
  "tags": ["string"],           // inferred category tags
  "isVirtual": "boolean or null"
}

If a field cannot be determined, use null.
```

**Response — 200 OK**

```json
{
  "query": "team lunches next week near downtown",
  "parsedFilters": {
    "keywords": ["team", "lunch"],
    "dateFrom": "2026-03-02T00:00:00.000Z",
    "dateTo": "2026-03-06T23:59:59.000Z",
    "location": "downtown",
    "tags": ["social", "food"],
    "isVirtual": false
  },
  "data": [
    {
      "id": "clevt1",
      "title": "Team Lunch — Thai Place",
      "startDateTime": "2026-03-04T12:00:00.000Z",
      "location": "123 Downtown Ave",
      "tags": ["social", "food"],
      "myStatus": "UPCOMING"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

---

## Feature 4: Conflict Detection & Resolution

### Description

When a user creates an event or RSVPs, the system proactively checks for scheduling conflicts and uses AI to suggest resolutions (reschedule, shorten, or prioritize).

### API Endpoint

#### `POST /api/ai/check-conflicts`

**Auth**: Required

**Request Body**

```json
{
  "userId": "cluser...",
  "startDateTime": "2026-03-10T09:00:00.000Z",
  "endDateTime": "2026-03-10T10:00:00.000Z",
  "eventTitle": "Sprint Planning"
}
```

**Validation (Zod)**

```typescript
const CheckConflictsSchema = z.object({
  userId: z.string().optional(), // defaults to current user
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
  eventTitle: z.string().max(200).optional(),
});
```

**Data Flow**

```
1. Validate request
2. Query user's existing events that overlap the time range:
   → Query the eventResponses collection:
     adminDb.collection('eventResponses')
       .where('userId', '==', userId)
       .where('status', 'in', ['ATTENDING', 'UPCOMING'])
       .where('eventStartDateTime', '<', endDateTime)
   → Filter results in application code where eventEndDateTime > startDateTime
   → Batch-read the corresponding event documents for full details
3. If no conflicts → return { hasConflicts: false }
4. If conflicts found → send to OpenAI for resolution suggestions:
   - Context: conflicting events, the new event, user's typical schedule
5. Return conflicts + AI suggestions
```

**OpenAI Prompt (System)**

```
You are a scheduling conflict resolver. A user wants to schedule a new event
but has conflicts with existing events.

Given the new event and conflicting events, suggest 2-3 resolutions.
Each resolution should include:
- type: "reschedule" | "shorten" | "skip" | "double-book"
- description: human-readable suggestion
- suggestedTime: (if reschedule) new ISO datetime
- reasoning: why this resolution makes sense

Return JSON:
{
  "resolutions": [
    {
      "type": "reschedule",
      "description": "string",
      "suggestedTime": { "start": "ISO", "end": "ISO" } | null,
      "reasoning": "string"
    }
  ]
}
```

**Response — 200 OK (conflicts found)**

```json
{
  "hasConflicts": true,
  "conflicts": [
    {
      "eventId": "clevt2",
      "title": "1:1 with Manager",
      "startDateTime": "2026-03-10T09:00:00.000Z",
      "endDateTime": "2026-03-10T09:30:00.000Z",
      "overlapMinutes": 30
    }
  ],
  "resolutions": [
    {
      "type": "reschedule",
      "description": "Move Sprint Planning to 9:30 AM, right after your 1:1.",
      "suggestedTime": {
        "start": "2026-03-10T09:30:00.000Z",
        "end": "2026-03-10T10:30:00.000Z"
      },
      "reasoning": "Your 1:1 ends at 9:30. Starting Sprint Planning immediately after avoids any gap and keeps your morning focused."
    },
    {
      "type": "shorten",
      "description": "Shorten Sprint Planning to 30 minutes (9:30–10:00).",
      "suggestedTime": {
        "start": "2026-03-10T09:30:00.000Z",
        "end": "2026-03-10T10:00:00.000Z"
      },
      "reasoning": "If the agenda is tight, a focused 30-minute session after your 1:1 could work."
    },
    {
      "type": "skip",
      "description": "Decline the 1:1 this week and prioritize Sprint Planning.",
      "suggestedTime": null,
      "reasoning": "If Sprint Planning is higher priority, consider rescheduling the 1:1 instead."
    }
  ]
}
```

**Response — 200 OK (no conflicts)**

```json
{
  "hasConflicts": false,
  "conflicts": [],
  "resolutions": []
}
```

---

## Feature 5: Attendee Recommendations

### Description

When creating or editing an event, AI suggests people to invite based on:
- Event topic/title similarity to past events
- Past attendance overlap (people who often attend similar events together)
- User's invitation history

### API Endpoint

#### `POST /api/ai/suggest-invitees`

**Auth**: Required

**Request Body**

```json
{
  "eventTitle": "Frontend Architecture Review",
  "eventDescription": "Reviewing our React component structure and state management approach",
  "tags": ["engineering", "frontend"],
  "alreadyInvited": ["clu1", "clu2"],
  "maxSuggestions": 5
}
```

**Validation (Zod)**

```typescript
const SuggestInviteesSchema = z.object({
  eventTitle: z.string().min(1).max(200),
  eventDescription: z.string().max(2000).optional(),
  tags: z.array(z.string()).max(10).optional(),
  alreadyInvited: z.array(z.string()).optional(),
  maxSuggestions: z.number().int().min(1).max(20).default(5),
});
```

**Data Flow**

```
1. Validate request
2. Query Firestore for context:
   a. Past events with matching tags:
      adminDb.collection('events')
        .where('tagNames', 'array-contains-any', tags)
      Then filter by title keyword similarity in application code
   b. Attendees of those events (query eventResponses by eventId, aggregate by userId for attendance frequency)
   c. Users the current user has frequently invited (query invitations by inviterId)
3. Exclude already-invited users
4. Send context to OpenAI:
   - List of candidate users with attendance history
   - Event details
5. OpenAI ranks candidates by relevance
6. Return top N suggestions with reasoning
```

**OpenAI Prompt (System)**

```
You are an assistant that recommends event attendees.
Given an event's title, description, and tags, plus a list of candidate users
with their past event attendance history, suggest the most relevant people to invite.

For each suggestion, provide:
- userId
- relevanceScore (0-1)
- reason: why this person is a good fit

Rank by relevance. Exclude users already invited.

Return JSON:
{
  "suggestions": [
    {
      "userId": "string",
      "relevanceScore": 0.92,
      "reason": "string"
    }
  ]
}
```

**Response — 200 OK**

```json
{
  "suggestions": [
    {
      "userId": "clu3",
      "user": { "id": "clu3", "name": "Charlie Kim", "email": "charlie@example.com", "avatarUrl": "..." },
      "relevanceScore": 0.92,
      "reason": "Charlie attended 4 out of 5 past frontend architecture events and is a senior frontend engineer."
    },
    {
      "userId": "clu4",
      "user": { "id": "clu4", "name": "Dana Lee", "email": "dana@example.com", "avatarUrl": "..." },
      "relevanceScore": 0.85,
      "reason": "Dana frequently attends engineering reviews and has overlapping availability with your usual meeting group."
    },
    {
      "userId": "clu5",
      "user": { "id": "clu5", "name": "Eli Chen", "email": "eli@example.com", "avatarUrl": "..." },
      "relevanceScore": 0.78,
      "reason": "Eli recently joined the frontend team and was invited to the last 2 related events."
    }
  ]
}
```

---

## Integration Points

### Where AI features connect to the UI

| UI Location | AI Feature | Trigger |
|-------------|-----------|---------|
| **Create Event form** | Smart Scheduling | "Suggest best time" button next to date picker |
| **Create Event form** | Description Generator | "Generate description" button next to description field |
| **Create Event form** | Conflict Detection | Auto-check on date selection (debounced) |
| **Event detail page** | Attendee Recommendations | "Suggest people to invite" in the invite modal |
| **Search bar** | NLP Search | Toggle "Smart search" mode, or auto-detect natural language |
| **Dashboard** | Conflict Detection | Banner alert when upcoming events conflict |

### Frontend Components

```
src/components/ai/
├── SmartScheduler.tsx         # Time suggestion UI with slot picker
├── DescriptionGenerator.tsx   # Text generation with tone selector + preview
├── NlpSearchBar.tsx           # Search bar with NLP mode toggle
├── ConflictAlert.tsx          # Conflict warning banner with resolution options
└── InviteeSuggestions.tsx     # Suggested attendees list with one-click invite
```

### Shared AI Utilities

```typescript
// src/lib/ai-helpers.ts
// Works with Firebase Auth — caller must verify the Firebase ID token
// via requireAuth() before invoking any AI helper.

/** Wrapper for OpenAI calls with error handling, retries, and cost logging */
export async function callOpenAI<T>(options: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: options.systemPrompt },
      { role: "user", content: options.userPrompt },
    ],
    temperature: options.temperature ?? 0.3,
    max_tokens: options.maxTokens ?? 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");

  return JSON.parse(content) as T;
}

/** Rate limiter check */
export async function checkAIRateLimit(userId: string): Promise<boolean> {
  // Check per-minute and per-day limits
  // Return true if allowed, false if exceeded
}
```

---

## Cost & Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| **API cost** | Rate limiting per user; cache frequent queries; use `gpt-4o-mini` for simpler tasks (description, search parsing) |
| **Latency** | Show loading skeletons; stream responses where possible; pre-fetch conflict checks |
| **Token usage** | Keep prompts concise; set `max_tokens` per endpoint; strip unnecessary data from context |
| **Fallback** | If OpenAI is down, degrade gracefully (disable AI buttons, show "AI unavailable" toast) |
| **Privacy** | Never send passwords or sensitive PII to OpenAI; only send event titles, times, and anonymized user IDs |

---

## Acceptance Criteria — AI Features

| # | Criterion | Verification |
|---|-----------|-------------|
| A-1 | Smart Scheduling returns 3 ranked time suggestions | POST /api/ai/suggest-time returns valid suggestions array |
| A-2 | Suggestions account for attendee conflicts | Suggestions avoid times when attendees have events |
| A-3 | Description Generator produces text matching requested tone | Compare tone in output to requested tone parameter |
| A-4 | Generated descriptions stay within maxLength | Character count ≤ maxLength |
| A-5 | NLP Search parses "next week" correctly relative to today | parsedFilters.dateFrom/dateTo match expected week range |
| A-6 | NLP Search returns relevant results | Results match parsed keyword and date filters |
| A-7 | Conflict Detection identifies overlapping events | hasConflicts=true when time overlaps exist |
| A-8 | Conflict resolutions include at least 2 actionable suggestions | resolutions array length ≥ 2 |
| A-9 | Attendee Recommendations exclude already-invited users | No overlap between suggestions and alreadyInvited |
| A-10 | All AI endpoints return 429 when rate limit exceeded | Rate-limited request returns 429 status |
| A-11 | All AI endpoints degrade gracefully on OpenAI failure | 502 with user-friendly error message, app remains usable |
| A-12 | AI responses are valid JSON matching documented schemas | Response validates against Zod output schema |
