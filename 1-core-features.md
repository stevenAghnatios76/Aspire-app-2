# Core Features — Event Scheduler Application

> Event CRUD, status tracking, search, user invitations, and notifications.

---

## 1. Data Models

All data is stored in **Firestore** collections. Relationships are handled via document references (stored as string IDs) and denormalized fields where needed for query efficiency.

### 1.1 `Event` (Firestore: `events/{eventId}`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` | Auto-generated document ID |
| `title` | `String` | Event title (max 200 chars) |
| `description` | `String?` | Rich-text event description (max 5000 chars) |
| `startDateTime` | `Timestamp` | Event start date/time (UTC) |
| `endDateTime` | `Timestamp` | Event end date/time (UTC) |
| `location` | `String?` | Physical address or virtual link |
| `isVirtual` | `Boolean` | Whether the event is online (default: `false`) |
| `virtualLink` | `String?` | Zoom/Meet/Teams link |
| `coverImageUrl` | `String?` | Event banner image |
| `maxAttendees` | `Number?` | Capacity limit (null = unlimited) |
| `isPublic` | `Boolean` | Visible to non-invited users (default: `true`) |
| `createdById` | `String` | User ID of event creator |
| `tagNames` | `String[]` | Denormalized array of tag name strings (e.g., `["work", "daily"]`) |
| `createdAt` | `Timestamp` | Creation timestamp (server timestamp) |
| `updatedAt` | `Timestamp` | Last edit timestamp (server timestamp) |

### 1.2 `EventResponse` (Firestore: `eventResponses/{responseId}`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` | Auto-generated document ID |
| `eventId` | `String` | Reference to Event document ID |
| `userId` | `String` | Reference to User (Firebase UID) |
| `status` | `String` | `"UPCOMING" \| "ATTENDING" \| "MAYBE" \| "DECLINED"` |
| `eventStartDateTime` | `Timestamp` | Denormalized from parent event (for efficient user schedule queries) |
| `eventEndDateTime` | `Timestamp` | Denormalized from parent event (for efficient user schedule queries) |
| `respondedAt` | `Timestamp` | When status was set (server timestamp) |
| `updatedAt` | `Timestamp` | Last status change (server timestamp) |

> **Uniqueness**: Enforce one response per user per event at the application level by querying `where("eventId", "==", eventId).where("userId", "==", userId)` before creating/updating.

### 1.3 `Invitation` (Firestore: `invitations/{invitationId}`)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` | Auto-generated document ID |
| `eventId` | `String` | Reference to Event document ID |
| `inviterId` | `String` | User ID of inviter |
| `inviteeEmail` | `String` | Email of invitee |
| `inviteeId` | `String?` | Resolved user ID (if registered) |
| `status` | `String` | `"PENDING" \| "ACCEPTED" \| "DECLINED"` |
| `message` | `String?` | Personal message from inviter (max 1000 chars) |
| `sentAt` | `Timestamp` | When invitation was sent (server timestamp) |
| `respondedAt` | `Timestamp?` | When invitee responded |
| `token` | `String` | Unique URL-safe token for email links |

### 1.4 `Tag` (Bonus — categorization)

> Tags are stored as a denormalized `tagNames` array directly on Event documents, eliminating the need for a separate collection or join table. If a master tag list is needed, a `tags` collection can store unique tag names:

**Firestore: `tags/{tagId}`**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `String` | Auto-generated document ID |
| `name` | `String` | Unique tag label (e.g., "work", "social") |

### Firestore Document Structures

```typescript
// Collection: events
interface EventDocument {
  id: string;
  title: string;
  description?: string;
  startDateTime: Timestamp;
  endDateTime: Timestamp;
  location?: string;
  isVirtual: boolean;
  virtualLink?: string;
  coverImageUrl?: string;
  maxAttendees?: number;
  isPublic: boolean;
  createdById: string;
  tagNames: string[];         // denormalized tag names for filtering
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Collection: eventResponses
interface EventResponseDocument {
  id: string;
  eventId: string;
  userId: string;
  status: "UPCOMING" | "ATTENDING" | "MAYBE" | "DECLINED";
  eventStartDateTime: Timestamp;  // denormalized for schedule queries
  eventEndDateTime: Timestamp;    // denormalized for schedule queries
  respondedAt: Timestamp;
  updatedAt: Timestamp;
}

// Collection: invitations
interface InvitationDocument {
  id: string;
  eventId: string;
  inviterId: string;
  inviteeEmail: string;
  inviteeId?: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  message?: string;
  sentAt: Timestamp;
  respondedAt?: Timestamp;
  token: string;
}

// Collection: tags
interface TagDocument {
  id: string;
  name: string;
}
```

---

## 2. Event CRUD API

### 2.1 `POST /api/events` — Create Event

**Auth**: Required

**Request Body**

```json
{
  "title": "Team Standup",
  "description": "Daily morning sync with the engineering team.",
  "startDateTime": "2026-03-10T09:00:00.000Z",
  "endDateTime": "2026-03-10T09:30:00.000Z",
  "location": "Room 4B",
  "isVirtual": false,
  "maxAttendees": 20,
  "isPublic": true,
  "tags": ["work", "daily"]
}
```

**Validation (Zod)**

```typescript
const CreateEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
  location: z.string().max(500).optional(),
  isVirtual: z.boolean().default(false),
  virtualLink: z.string().url().optional(),
  coverImageUrl: z.string().url().optional(),
  maxAttendees: z.number().int().positive().optional(),
  isPublic: z.boolean().default(true),
  tags: z.array(z.string().max(50)).max(10).optional(),
}).refine(
  (data) => new Date(data.endDateTime) > new Date(data.startDateTime),
  { message: "End time must be after start time" }
);
```

**Response — 201 Created**

```json
{
  "id": "clxyz...",
  "title": "Team Standup",
  "description": "Daily morning sync with the engineering team.",
  "startDateTime": "2026-03-10T09:00:00.000Z",
  "endDateTime": "2026-03-10T09:30:00.000Z",
  "location": "Room 4B",
  "isVirtual": false,
  "virtualLink": null,
  "coverImageUrl": null,
  "maxAttendees": 20,
  "isPublic": true,
  "createdBy": { "id": "cluser...", "name": "Jane Doe" },
  "tags": [{ "id": "cltag1", "name": "work" }, { "id": "cltag2", "name": "daily" }],
  "createdAt": "2026-02-26T12:00:00.000Z"
}
```

**Errors**

| Status | Condition |
|--------|-----------|
| 400 | Validation failed |
| 401 | Not authenticated |

---

### 2.2 `GET /api/events` — List Events

**Auth**: Required

**Query Parameters**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | `int` | 1 | Page number |
| `limit` | `int` | 20 | Items per page (max 100) |
| `sort` | `string` | `startDateTime` | Sort field |
| `order` | `asc \| desc` | `asc` | Sort direction |
| `filter` | `upcoming \| past \| all` | `upcoming` | Time filter |

**Response — 200 OK**

```json
{
  "data": [
    {
      "id": "clxyz...",
      "title": "Team Standup",
      "startDateTime": "2026-03-10T09:00:00.000Z",
      "endDateTime": "2026-03-10T09:30:00.000Z",
      "location": "Room 4B",
      "isVirtual": false,
      "createdBy": { "id": "cluser...", "name": "Jane Doe" },
      "responseCount": { "attending": 8, "maybe": 3, "declined": 1 },
      "myStatus": "ATTENDING",
      "tags": [{ "name": "work" }]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

### 2.3 `GET /api/events/:id` — Get Event Detail

**Auth**: Required (public events viewable by any authenticated user; private events only by creator/invitees)

**Response — 200 OK**

```json
{
  "id": "clxyz...",
  "title": "Team Standup",
  "description": "Daily morning sync with the engineering team.",
  "startDateTime": "2026-03-10T09:00:00.000Z",
  "endDateTime": "2026-03-10T09:30:00.000Z",
  "location": "Room 4B",
  "isVirtual": false,
  "virtualLink": null,
  "coverImageUrl": null,
  "maxAttendees": 20,
  "isPublic": true,
  "createdBy": { "id": "cluser...", "name": "Jane Doe", "avatarUrl": "https://..." },
  "tags": [{ "id": "cltag1", "name": "work" }, { "id": "cltag2", "name": "daily" }],
  "responses": [
    { "user": { "id": "clu1", "name": "Alice" }, "status": "ATTENDING", "respondedAt": "..." },
    { "user": { "id": "clu2", "name": "Bob" }, "status": "MAYBE", "respondedAt": "..." }
  ],
  "myStatus": "ATTENDING",
  "isOwner": true,
  "createdAt": "2026-02-26T12:00:00.000Z",
  "updatedAt": "2026-02-26T12:00:00.000Z"
}
```

**Errors**: `404` if not found, `403` if private and user not authorized.

---

### 2.4 `PUT /api/events/:id` — Update Event

**Auth**: Required — **only the event creator** can edit.

**Request Body**: Same shape as `POST /api/events` (all fields optional — partial update).

**Response**: `200 OK` with updated event object.

**Errors**: `403` if not the creator, `404` if not found.

---

### 2.5 `DELETE /api/events/:id` — Delete Event

**Auth**: Required — **only the event creator** can delete.

**Response — 204 No Content**

**Side Effects**:
- All related `EventResponse` records are cascade-deleted.
- All related `Invitation` records are cascade-deleted.
- Attendees receive a cancellation notification email.

---

## 3. RSVP / Status Tracking API

### 3.1 `POST /api/events/:id/rsvp` — Set RSVP Status

**Auth**: Required

**Request Body**

```json
{
  "status": "ATTENDING"
}
```

**Validation**

```typescript
const RsvpSchema = z.object({
  status: z.enum(["UPCOMING", "ATTENDING", "MAYBE", "DECLINED"]),
});
```

**Behavior**:
- Creates a new `EventResponse` or updates existing (upsert on `[eventId, userId]`).
- If `maxAttendees` is set and `ATTENDING` count has reached the limit, return `409 Conflict` with `"Event is full"`.

**Response — 200 OK**

```json
{
  "eventId": "clxyz...",
  "userId": "cluser...",
  "status": "ATTENDING",
  "respondedAt": "2026-02-26T14:00:00.000Z"
}
```

### 3.2 `GET /api/events/:id/responses` — List RSVPs

**Auth**: Required

**Response — 200 OK**

```json
{
  "eventId": "clxyz...",
  "summary": {
    "upcoming": 2,
    "attending": 8,
    "maybe": 3,
    "declined": 1,
    "total": 14
  },
  "responses": [
    {
      "user": { "id": "clu1", "name": "Alice", "avatarUrl": "..." },
      "status": "ATTENDING",
      "respondedAt": "2026-02-26T14:00:00.000Z"
    }
  ]
}
```

---

## 4. Invitation API

### 4.1 `POST /api/events/:id/invite` — Send Invitations

**Auth**: Required — event creator or any attendee (configurable per event)

**Request Body**

```json
{
  "emails": ["alice@example.com", "bob@example.com"],
  "message": "Would love for you to join our event!"
}
```

**Validation**

```typescript
const InviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(50),
  message: z.string().max(1000).optional(),
});
```

**Behavior**:
1. For each email, create an `Invitation` record with a unique `token`.
2. If the email matches a registered user, set `inviteeId`.
3. Send an invitation email with a link: `{APP_URL}/invitations/respond?token={token}`.
4. Skip duplicates (same email + same event).

**Response — 201 Created**

```json
{
  "sent": 2,
  "skipped": 0,
  "invitations": [
    { "id": "clinv1", "inviteeEmail": "alice@example.com", "status": "PENDING" },
    { "id": "clinv2", "inviteeEmail": "bob@example.com", "status": "PENDING" }
  ]
}
```

### 4.2 `GET /api/invitations` — List My Invitations

**Auth**: Required

**Query Parameters**: `status` (filter by `PENDING | ACCEPTED | DECLINED`), `page`, `limit`.

**Response — 200 OK**

```json
{
  "data": [
    {
      "id": "clinv1",
      "event": {
        "id": "clxyz...",
        "title": "Team Standup",
        "startDateTime": "2026-03-10T09:00:00.000Z",
        "location": "Room 4B"
      },
      "inviter": { "id": "cluser...", "name": "Jane Doe" },
      "message": "Would love for you to join!",
      "status": "PENDING",
      "sentAt": "2026-02-26T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

### 4.3 `PUT /api/invitations/:id/respond` — Accept or Decline

**Auth**: Required (invitee only) **or** token-based (from email link)

**Request Body**

```json
{
  "status": "ACCEPTED"
}
```

**Behavior**:
- Update `Invitation.status` and set `respondedAt`.
- If `ACCEPTED`, automatically create an `EventResponse` with status `ATTENDING`.
- If `DECLINED`, create an `EventResponse` with status `DECLINED`.
- Notify the event creator of the response.

**Response — 200 OK**

```json
{
  "id": "clinv1",
  "status": "ACCEPTED",
  "respondedAt": "2026-02-26T15:00:00.000Z"
}
```

### 4.4 `GET /api/invitations/respond?token=xxx` — Token-based Response Page

> For users clicking the email link. Renders a page showing event details and accept/decline buttons. If the user is not logged in, prompt to register/login first, then auto-process the invitation.

---

## 5. Search API

### 5.1 `GET /api/events/search` — Search Events

**Auth**: Required

**Query Parameters**

| Param | Type | Example | Description |
|-------|------|---------|-------------|
| `q` | `string` | `"standup"` | Full-text search on title + description |
| `dateFrom` | `ISO datetime` | `2026-03-01T00:00:00Z` | Events starting on or after |
| `dateTo` | `ISO datetime` | `2026-03-31T23:59:59Z` | Events starting on or before |
| `location` | `string` | `"Room 4B"` | Partial match on location |
| `tags` | `string` (comma-separated) | `"work,daily"` | Filter by tags |
| `status` | `RsvpStatus` | `ATTENDING` | Filter by my RSVP status |
| `isVirtual` | `boolean` | `true` | Filter virtual/in-person |
| `createdBy` | `string` (userId) | `"cluser..."` | Events by a specific creator |
| `page` | `int` | 1 | Pagination |
| `limit` | `int` | 20 | Page size |

**Implementation Notes**:
- Firestore does not support native full-text search. For the `q` parameter, query Firestore with available filters (date range, tags via `array-contains-any`, `createdById`) and then perform client-side/server-side keyword filtering on title and description fields.
- For production-scale search, consider integrating a dedicated search service (e.g., Algolia, Typesense, or Meilisearch) synced with Firestore.
- Combine Firestore query filters with `where()` clauses. Apply keyword matching in application code after fetching results.
- Return results sorted by `startDateTime` (default) via Firestore `orderBy()`.

**Response — 200 OK**

```json
{
  "data": [
    {
      "id": "clxyz...",
      "title": "Team Standup",
      "startDateTime": "2026-03-10T09:00:00.000Z",
      "location": "Room 4B",
      "tags": ["work", "daily"],
      "myStatus": "ATTENDING",
      "relevanceScore": 0.95
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 },
  "appliedFilters": {
    "q": "standup",
    "dateFrom": "2026-03-01T00:00:00Z",
    "dateTo": "2026-03-31T23:59:59Z"
  }
}
```

---

## 6. Notifications (Bonus Feature)

### 6.1 Email Notifications

Sent via **Resend** / **SendGrid** for:

| Trigger | Recipient | Content |
|---------|-----------|---------|
| New invitation | Invitee | Event details + accept/decline link |
| Invitation accepted | Event creator | "{name} accepted your invitation" |
| Event updated | All attendees | Summary of changes |
| Event cancelled | All attendees | Cancellation notice |
| Event reminder | Attendees (ATTENDING/MAYBE) | 24h and 1h before event |

### 6.2 In-App Notification Model (Bonus)

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `String` (cuid) | PK | |
| `userId` | `String` | FK → User.id | Recipient |
| `type` | `Enum` | `INVITATION \| RSVP \| UPDATE \| REMINDER \| CANCELLATION` | |
| `title` | `String` | NOT NULL | Short notification text |
| `body` | `String?` | Nullable | Detailed message |
| `eventId` | `String?` | FK → Event.id | Related event |
| `isRead` | `Boolean` | Default: `false` | Read status |
| `createdAt` | `DateTime` | Default: `now()` | |

**API**:
- `GET /api/notifications` — list notifications (paginated, unread first)
- `PUT /api/notifications/:id/read` — mark as read
- `PUT /api/notifications/read-all` — mark all as read
- `GET /api/notifications/unread-count` — returns `{ "count": 5 }`

---

## 7. Extra Features (Creativity)

| Feature | Description |
|---------|-------------|
| **Calendar View** | Month/week/day view using a library like `react-big-calendar` or `@fullcalendar/react` |
| **Recurring Events** | Support daily/weekly/monthly recurrence with RRULE pattern |
| **Event Templates** | Save and reuse event configurations |
| **Export to Calendar** | Generate `.ics` files for import into Google Calendar / Outlook |
| **Dark Mode** | System-aware theme toggle using `next-themes` |
| **Real-time Updates** | Use Firestore `onSnapshot` listeners for live RSVP count updates |
| **Event Comments** | Threaded discussion on event pages |
| **Map Integration** | Show event location on an embedded map (Google Maps / Mapbox) |

---

## 8. Acceptance Criteria — Core Features

### Events

| # | Criterion | Verification |
|---|-----------|-------------|
| C-1 | User can create an event with title, date/time, location, and description | POST returns 201, event appears in list |
| C-2 | User can view a paginated list of their events | GET /api/events returns data with pagination |
| C-3 | User can view full details of a single event | GET /api/events/:id returns all fields |
| C-4 | User can edit an event they created | PUT returns 200 with updated fields |
| C-5 | User can delete an event they created | DELETE returns 204, event no longer accessible |
| C-6 | User cannot edit/delete events created by others | PUT/DELETE returns 403 |
| C-7 | End time must be after start time | Validation rejects invalid range |

### Status Tracking

| # | Criterion | Verification |
|---|-----------|-------------|
| C-8 | User can RSVP to an event as ATTENDING | RSVP POST returns 200 with ATTENDING status |
| C-9 | User can change RSVP to MAYBE or DECLINED | Subsequent RSVP POST updates status |
| C-10 | RSVP counts are visible on event detail | Response summary shows correct counts |
| C-11 | Full event prevents new ATTENDING RSVPs | Returns 409 when at maxAttendees |

### Invitations

| # | Criterion | Verification |
|---|-----------|-------------|
| C-12 | Creator can invite users by email | POST /api/events/:id/invite returns 201 |
| C-13 | Invitee receives email with event link | Email sent via Resend/SendGrid |
| C-14 | Invitee can accept/decline via email link | Token-based response works |
| C-15 | Accepting an invitation auto-creates ATTENDING RSVP | EventResponse created on accept |
| C-16 | User can view their pending invitations | GET /api/invitations lists pending |

### Search

| # | Criterion | Verification |
|---|-----------|-------------|
| C-17 | User can search events by title keyword | `q=standup` returns matching events |
| C-18 | User can filter events by date range | `dateFrom` + `dateTo` returns correct range |
| C-19 | User can filter events by location | `location=Room` returns partial matches |
| C-20 | Filters can be combined | Multiple params narrow results correctly |
| C-21 | Search results are paginated | Pagination object included in response |

---

## Implementation Checklist

### Data Models
- [ ] Define `EventDocument` interface in `src/types/firestore.ts`
- [ ] Define `EventResponseDocument` interface in `src/types/firestore.ts`
- [ ] Define `InvitationDocument` interface in `src/types/firestore.ts`
- [ ] Define `TagDocument` interface (optional) in `src/types/firestore.ts`

### Event CRUD
- [ ] Implement `POST /api/events` — create event with Zod validation
- [ ] Implement `GET /api/events` — paginated list with filters
- [ ] Implement `GET /api/events/:id` — event detail with access control
- [ ] Implement `PUT /api/events/:id` — update event (creator only)
- [ ] Implement `DELETE /api/events/:id` — delete event + cascade deletes (creator only)

### RSVP / Status Tracking
- [ ] Implement `POST /api/events/:id/rsvp` — upsert RSVP status
- [ ] Enforce `maxAttendees` capacity check (return 409 when full)
- [ ] Implement `GET /api/events/:id/responses` — list RSVPs with summary counts

### Invitations
- [ ] Implement `POST /api/events/:id/invite` — send invitations by email, generate unique tokens
- [ ] Implement `GET /api/invitations` — list authenticated user's invitations
- [ ] Implement `PUT /api/invitations/:id/respond` — accept/decline + auto-create EventResponse
- [ ] Implement `GET /api/invitations/respond?token=xxx` — token-based response page

### Search
- [ ] Implement `GET /api/events/search` — keyword + filter + pagination
- [ ] Apply Firestore `where()` filters for date range, tags, `createdById`, `isVirtual`
- [ ] Apply server-side keyword matching on `title` and `description`

### Notifications
- [ ] Set up Resend (or SendGrid) email service in `src/lib/email.ts`
- [ ] Send invitation email on `POST /api/events/:id/invite`
- [ ] Send "invitation accepted" email to event creator on RSVP accept
- [ ] Send event-updated email to all attendees on `PUT /api/events/:id`
- [ ] Send cancellation email to all attendees on `DELETE /api/events/:id`
- [ ] Implement in-app notification model (optional bonus)
- [ ] Implement notification API endpoints (`GET`, `PUT /read`, `PUT /read-all`, `GET /unread-count`)
