import { tool } from "@langchain/core/tools";
import { getAdminDb } from "./firebase-admin";
import { callGemini } from "./ai-helpers";
import { EventDoc, EventResponseDoc, InvitationDoc } from "@/types/firestore";
import { hasTimeOverlap } from "@/utils/dates";
import crypto from "crypto";
import { Resend } from "resend";

// ─── Tool 1: search_events ──────────────────────────────────────────────────

function createSearchEventsTool() {
  return tool(
    async ({
      query,
      tags,
      dateFrom,
      dateTo,
      filter,
    }: {
      query?: string;
      tags?: string[];
      dateFrom?: string;
      dateTo?: string;
      filter?: string;
    }) => {
      const db = getAdminDb();
      const now = new Date().toISOString();

      let ref = db.collection("events").orderBy("startDateTime", "asc");

      // Apply filter
      const effectiveFilter = filter || "upcoming";
      if (effectiveFilter === "upcoming") {
        ref = ref.where("startDateTime", ">=", now);
      } else if (effectiveFilter === "past") {
        ref = ref.where("endDateTime", "<", now);
      }

      // Apply date range (only if not already filtered by upcoming/past)
      if (dateFrom && effectiveFilter === "all") {
        ref = ref.where("startDateTime", ">=", dateFrom);
      }

      const snapshot = await ref.limit(50).get();
      let events = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as EventDoc),
      }));

      // Filter by dateTo in app code
      if (dateTo) {
        events = events.filter((e) => e.startDateTime <= dateTo);
      }

      // Filter by tags in app code (Firestore array-contains-any only supports one)
      if (tags && tags.length > 0) {
        events = events.filter((e) =>
          tags.some((t) =>
            e.tagNames?.some(
              (tn) => tn.toLowerCase() === t.toLowerCase()
            )
          )
        );
      }

      // Filter by keyword in app code
      if (query) {
        const q = query.toLowerCase();
        events = events.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            e.description?.toLowerCase().includes(q)
        );
      }

      const results = events.slice(0, 20).map((e) => ({
        id: e.id,
        title: e.title,
        startDateTime: e.startDateTime,
        endDateTime: e.endDateTime,
        location: e.location || null,
        isVirtual: e.isVirtual,
        tagNames: e.tagNames,
      }));

      return JSON.stringify(results);
    },
    {
      name: "search_events",
      description:
        "Search for events by keyword, tag, or date range. Use this to find existing events.",
      schema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Keyword to search in event title or description",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Filter events by tag names",
          },
          dateFrom: {
            type: "string",
            description: "ISO 8601 datetime — events starting on or after",
          },
          dateTo: {
            type: "string",
            description: "ISO 8601 datetime — events starting on or before",
          },
          filter: {
            type: "string",
            enum: ["upcoming", "past", "all"],
            description:
              'Time filter: "upcoming" (default), "past", or "all"',
          },
        },
      },
    }
  );
}

// ─── Tool 2: get_my_schedule ─────────────────────────────────────────────────

function createGetMyScheduleTool(userId: string) {
  return tool(
    async ({ days }: { days?: number }) => {
      const db = getAdminDb();
      const now = new Date();
      const cutoff = new Date(
        now.getTime() + (days || 30) * 24 * 60 * 60 * 1000
      ).toISOString();

      const responsesSnap = await db
        .collection("eventResponses")
        .where("userId", "==", userId)
        .where("status", "in", ["ATTENDING", "UPCOMING"])
        .where("eventStartDateTime", ">=", now.toISOString())
        .get();

      const responses = responsesSnap.docs
        .map((doc) => doc.data() as EventResponseDoc)
        .filter((r) => r.eventStartDateTime <= cutoff);

      // Batch-fetch events
      const eventIds = Array.from(new Set(responses.map((r) => r.eventId)));
      const eventMap = new Map<string, EventDoc>();

      for (let i = 0; i < eventIds.length; i += 10) {
        const batch = eventIds.slice(i, i + 10);
        const snapshots = await Promise.all(
          batch.map((id) => db.collection("events").doc(id).get())
        );
        for (const snap of snapshots) {
          if (snap.exists) {
            eventMap.set(snap.id, snap.data() as EventDoc);
          }
        }
      }

      const schedule = responses.map((r) => {
        const event = eventMap.get(r.eventId);
        return {
          eventId: r.eventId,
          title: event?.title || "Unknown Event",
          startDateTime: r.eventStartDateTime,
          endDateTime: r.eventEndDateTime,
          myStatus: r.status,
          location: event?.location || null,
          isVirtual: event?.isVirtual || false,
        };
      });

      // Sort by start time
      schedule.sort(
        (a, b) =>
          new Date(a.startDateTime).getTime() -
          new Date(b.startDateTime).getTime()
      );

      return JSON.stringify(schedule);
    },
    {
      name: "get_my_schedule",
      description:
        "Get the current user's upcoming events and RSVPs for the next N days. Use this before scheduling to check for conflicts.",
      schema: {
        type: "object" as const,
        properties: {
          days: {
            type: "number",
            description:
              "Number of days ahead to look (1-90, default 30)",
          },
        },
      },
    }
  );
}

// ─── Tool 3: check_conflicts ─────────────────────────────────────────────────

function createCheckConflictsTool(userId: string) {
  return tool(
    async ({
      startDateTime,
      endDateTime,
    }: {
      startDateTime: string;
      endDateTime: string;
    }) => {
      const db = getAdminDb();

      const responsesSnap = await db
        .collection("eventResponses")
        .where("userId", "==", userId)
        .where("status", "in", ["ATTENDING", "UPCOMING"])
        .get();

      const conflicting = responsesSnap.docs.filter((doc) => {
        const r = doc.data() as EventResponseDoc;
        return hasTimeOverlap(
          startDateTime,
          endDateTime,
          r.eventStartDateTime,
          r.eventEndDateTime
        );
      });

      if (conflicting.length === 0) {
        return JSON.stringify({ hasConflict: false, conflicts: [] });
      }

      // Fetch conflicting event details
      const eventIds = Array.from(new Set(
        conflicting.map((doc) => (doc.data() as EventResponseDoc).eventId)
      ));

      const conflicts = await Promise.all(
        eventIds.map(async (eventId) => {
          const snap = await db.collection("events").doc(eventId).get();
          const event = snap.data() as EventDoc;
          return {
            eventId,
            title: event?.title || "Unknown",
            startDateTime: event?.startDateTime,
            endDateTime: event?.endDateTime,
          };
        })
      );

      return JSON.stringify({ hasConflict: true, conflicts });
    },
    {
      name: "check_conflicts",
      description:
        "Check if a proposed time slot conflicts with the user's existing events. Call this before creating an event.",
      schema: {
        type: "object" as const,
        properties: {
          startDateTime: {
            type: "string",
            description: "Proposed event start in ISO 8601 format",
          },
          endDateTime: {
            type: "string",
            description: "Proposed event end in ISO 8601 format",
          },
        },
        required: ["startDateTime", "endDateTime"],
      },
    }
  );
}

// ─── Tool 4: create_event ────────────────────────────────────────────────────

function createCreateEventTool(userId: string) {
  return tool(
    async ({
      title,
      description,
      startDateTime,
      endDateTime,
      location,
      isVirtual,
      virtualLink,
      maxAttendees,
      isPublic,
      tagNames,
    }: {
      title: string;
      description?: string;
      startDateTime: string;
      endDateTime: string;
      location?: string;
      isVirtual?: boolean;
      virtualLink?: string;
      maxAttendees?: number;
      isPublic?: boolean;
      tagNames?: string[];
    }) => {
      const db = getAdminDb();
      const now = new Date().toISOString();

      const eventData = {
        title,
        description: description || "",
        startDateTime,
        endDateTime,
        location: location || "",
        isVirtual: isVirtual ?? false,
        virtualLink: virtualLink || "",
        maxAttendees: maxAttendees || null,
        isPublic: isPublic ?? true,
        tagNames: tagNames || [],
        createdById: userId,
        createdAt: now,
        updatedAt: now,
      };

      const eventRef = await db.collection("events").add(eventData);

      // Also create an eventResponse for the creator (matching VoiceEventCreator pattern)
      await db.collection("eventResponses").add({
        eventId: eventRef.id,
        userId,
        status: "UPCOMING",
        eventStartDateTime: startDateTime,
        eventEndDateTime: endDateTime,
        respondedAt: now,
        updatedAt: now,
      });

      return JSON.stringify({
        eventId: eventRef.id,
        title,
        startDateTime,
        endDateTime,
      });
    },
    {
      name: "create_event",
      description:
        "Create a new event in the system. IMPORTANT: Only call this after confirming the details with the user.",
      schema: {
        type: "object" as const,
        properties: {
          title: {
            type: "string",
            description: "Event title (1-200 chars)",
          },
          description: {
            type: "string",
            description: "Event description (optional, max 5000 chars)",
          },
          startDateTime: {
            type: "string",
            description: "Event start in ISO 8601 format",
          },
          endDateTime: {
            type: "string",
            description: "Event end in ISO 8601 format",
          },
          location: {
            type: "string",
            description: "Physical location (optional)",
          },
          isVirtual: {
            type: "boolean",
            description: "Whether the event is virtual (default false)",
          },
          virtualLink: {
            type: "string",
            description: "Zoom/Meet/Teams link (optional)",
          },
          maxAttendees: {
            type: "number",
            description: "Max attendee capacity (optional)",
          },
          isPublic: {
            type: "boolean",
            description:
              "Whether the event is publicly visible (default true)",
          },
          tagNames: {
            type: "array",
            items: { type: "string" },
            description: "Tag names for categorization (max 10)",
          },
        },
        required: ["title", "startDateTime", "endDateTime"],
      },
    }
  );
}

// ─── Tool 5: invite_people ───────────────────────────────────────────────────

function createInvitePeopleTool(userId: string, userEmail: string, userName?: string) {
  return tool(
    async ({
      eventId,
      emails,
      message,
    }: {
      eventId: string;
      emails: string[];
      message?: string;
    }) => {
      const db = getAdminDb();

      // Verify event exists and user is the creator
      const eventSnap = await db.collection("events").doc(eventId).get();
      if (!eventSnap.exists) {
        return JSON.stringify({ error: "Event not found" });
      }
      const event = eventSnap.data() as EventDoc;
      if (event.createdById !== userId) {
        return JSON.stringify({
          error: "You can only invite people to events you created",
        });
      }

      const invited: string[] = [];
      let skipped = 0;

      for (const email of emails) {
        // Check for duplicates
        const existing = await db
          .collection("invitations")
          .where("eventId", "==", eventId)
          .where("inviteeEmail", "==", email)
          .limit(1)
          .get();

        if (!existing.empty) {
          skipped++;
          continue;
        }

        // Check if invitee is a registered user
        let inviteeId: string | undefined;
        const userQuery = await db
          .collection("users")
          .where("email", "==", email)
          .limit(1)
          .get();
        if (!userQuery.empty) {
          inviteeId = userQuery.docs[0].id;
        }

        const token = crypto.randomBytes(32).toString("hex");
        const now = new Date().toISOString();

        const invitationDoc: InvitationDoc = {
          eventId,
          inviterId: userId,
          inviteeEmail: email,
          inviteeId,
          status: "PENDING",
          message: message || undefined,
          sentAt: now,
          token,
        };

        await db.collection("invitations").add(invitationDoc);
        invited.push(email);

        // Send email via Resend
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const appUrl =
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const respondUrl = `${appUrl}/invitations/respond?token=${token}`;
          const isExistingUser = !!inviteeId;
          const registerUrl = `${appUrl}/register?redirect=${encodeURIComponent("/invitations/respond?token=" + token)}`;
          const senderName = userName || userEmail;

          const emailHtml = isExistingUser
            ? `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                <h2 style="font-size:20px;color:#333">You're Invited!</h2>
                <p style="font-size:16px;color:#555">
                  <strong>${senderName}</strong> has invited you to <strong>${event.title}</strong>.
                </p>
                ${event.startDateTime ? `<p style="font-size:14px;color:#777">📅 ${new Date(event.startDateTime).toLocaleString()}</p>` : ""}
                ${event.location ? `<p style="font-size:14px;color:#777">📍 ${event.location}</p>` : ""}
                ${message ? `<p style="font-size:14px;color:#555;font-style:italic">"${message}"</p>` : ""}
                <p style="margin-top:20px">
                  <a href="${respondUrl}" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
                    Respond to Invitation
                  </a>
                </p>
              </div>
            `
            : `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                <h2 style="font-size:20px;color:#333">You're Invited!</h2>
                <p style="font-size:16px;color:#555">
                  <strong>${senderName}</strong> has invited you to <strong>${event.title}</strong>.
                </p>
                ${event.startDateTime ? `<p style="font-size:14px;color:#777">📅 ${new Date(event.startDateTime).toLocaleString()}</p>` : ""}
                ${event.location ? `<p style="font-size:14px;color:#777">📍 ${event.location}</p>` : ""}
                ${message ? `<p style="font-size:14px;color:#555;font-style:italic">"${message}"</p>` : ""}
                <p style="font-size:14px;color:#555">Create an account to respond to this invitation:</p>
                <p style="margin-top:20px">
                  <a href="${registerUrl}" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">
                    Create Account & Respond
                  </a>
                </p>
              </div>
            `;

          const { data: _emailData, error: emailError } = await resend.emails.send({
            from: `${senderName} via Aspire <onboarding@resend.dev>`,
            replyTo: userEmail,
            to: email,
            subject: `${senderName} invited you to ${event.title}`,
            html: emailHtml,
          });

          if (emailError) {
            console.error("Resend API error for", email, emailError);
            return JSON.stringify({
              error: `Invitation was created but the email to ${email} could not be sent: ${emailError.message}. To send emails to external recipients, a verified custom domain is needed at resend.com/domains.`,
              invited: invited.length,
              emailFailed: true,
            });
          }
        } catch (emailError) {
          console.error("Failed to send invitation email to", email, emailError);
          return JSON.stringify({
            error: `Invitation was created but the email to ${email} failed to send due to an unexpected error. The invitation still exists in the system — the invitee can find it by logging in.`,
            invited: invited.length,
            emailFailed: true,
          });
        }
      }

      return JSON.stringify({ invited: invited.length, skipped, emails: invited });
    },
    {
      name: "invite_people",
      description:
        "Send invitations to people by email for a specific event. IMPORTANT: Only call this after confirming with the user.",
      schema: {
        type: "object" as const,
        properties: {
          eventId: {
            type: "string",
            description: "The ID of the event to invite people to",
          },
          emails: {
            type: "array",
            items: { type: "string" },
            description: "Array of email addresses to invite (1-50)",
          },
          message: {
            type: "string",
            description: "Optional personal message to include in the invitation",
          },
        },
        required: ["eventId", "emails"],
      },
    }
  );
}

// ─── Tool 6: suggest_meeting_time ────────────────────────────────────────────

function createSuggestMeetingTimeTool() {
  return tool(
    async ({
      attendeeIds,
      preferredDateFrom,
      preferredDateTo,
      durationMinutes,
    }: {
      attendeeIds: string[];
      preferredDateFrom: string;
      preferredDateTo: string;
      durationMinutes?: number;
    }) => {
      const db = getAdminDb();
      const duration = durationMinutes || 60;

      // Build busy slots for each attendee
      const busySlots: Record<
        string,
        Array<{ start: string; end: string; title: string }>
      > = {};

      for (let i = 0; i < attendeeIds.length; i += 30) {
        const batch = attendeeIds.slice(i, i + 30);
        const responsesSnap = await db
          .collection("eventResponses")
          .where("userId", "in", batch)
          .where("status", "in", ["ATTENDING", "UPCOMING"])
          .where("eventStartDateTime", ">=", preferredDateFrom)
          .get();

        for (const doc of responsesSnap.docs) {
          const r = doc.data() as EventResponseDoc;
          if (r.eventStartDateTime > preferredDateTo) continue;

          if (!busySlots[r.userId]) busySlots[r.userId] = [];

          const eventSnap = await db
            .collection("events")
            .doc(r.eventId)
            .get();
          const event = eventSnap.data() as EventDoc | undefined;

          busySlots[r.userId].push({
            start: r.eventStartDateTime,
            end: r.eventEndDateTime,
            title: event?.title || "Busy",
          });
        }
      }

      for (const id of attendeeIds) {
        if (!busySlots[id]) busySlots[id] = [];
      }

      const result = await callGemini<{
        suggestions: Array<{
          startDateTime: string;
          endDateTime: string;
          score: number;
          reason: string;
        }>;
      }>({
        systemPrompt: `You are a smart scheduling assistant. Given attendee busy slots, suggest 3 optimal time slots.
Return JSON:
{
  "suggestions": [
    { "startDateTime": "ISO", "endDateTime": "ISO", "score": 0.95, "reason": "All attendees free" }
  ]
}`,
        userPrompt: JSON.stringify({
          durationMinutes: duration,
          preferredDateRange: {
            from: preferredDateFrom,
            to: preferredDateTo,
          },
          attendeeBusySlots: busySlots,
        }),
        temperature: 0.3,
        maxTokens: 800,
      });

      return JSON.stringify(result.suggestions);
    },
    {
      name: "suggest_meeting_time",
      description:
        "Suggest optimal time slots for a meeting given attendee IDs and a preferred date range.",
      schema: {
        type: "object" as const,
        properties: {
          attendeeIds: {
            type: "array",
            items: { type: "string" },
            description: "Array of user IDs to check availability for (1-20)",
          },
          preferredDateFrom: {
            type: "string",
            description: "Start of preferred date range in ISO 8601",
          },
          preferredDateTo: {
            type: "string",
            description: "End of preferred date range in ISO 8601",
          },
          durationMinutes: {
            type: "number",
            description: "Meeting duration in minutes (default 60)",
          },
        },
        required: ["attendeeIds", "preferredDateFrom", "preferredDateTo"],
      },
    }
  );
}

// ─── Tool 7: build_agenda ────────────────────────────────────────────────────

function createBuildAgendaTool() {
  return tool(
    async ({
      title,
      durationMinutes,
      eventType,
      speakerCount,
    }: {
      title: string;
      durationMinutes: number;
      eventType?: string;
      speakerCount?: number;
    }) => {
      const type = eventType || "other";
      const speakers = speakerCount || 1;

      const result = await callGemini<{
        agenda: Array<{
          startOffset: number;
          endOffset: number;
          title: string;
          description: string;
          type: string;
          speaker?: string;
        }>;
        formattedText: string;
      }>({
        systemPrompt: `You are an expert event agenda planner. Generate a detailed, time-blocked agenda.

Rules:
- Total agenda MUST span exactly ${durationMinutes} minutes (from offset 0 to ${durationMinutes})
- No gaps and no overlaps between agenda items
- Include breaks for events over 90 minutes
- Plan for approximately ${speakers} speaker(s)
- Each item has a "type" from: session, break, networking, keynote, workshop, qa, closing
- For "formattedText", use relative times like "0:00 - 0:30"

Return JSON:
{
  "agenda": [
    {
      "startOffset": 0,
      "endOffset": 30,
      "title": "string",
      "description": "string",
      "type": "keynote",
      "speaker": "Speaker name or null"
    }
  ],
  "formattedText": "Formatted agenda text"
}`,
        userPrompt: JSON.stringify({
          title,
          eventType: type,
          durationMinutes,
          speakerCount: speakers,
          includeBreaks: true,
        }),
        temperature: 0.5,
        maxTokens: 1500,
      });

      return JSON.stringify(result);
    },
    {
      name: "build_agenda",
      description:
        "Generate a time-blocked agenda for an event given its duration and type.",
      schema: {
        type: "object" as const,
        properties: {
          title: {
            type: "string",
            description: "Event title",
          },
          durationMinutes: {
            type: "number",
            description: "Event duration in minutes (15-480)",
          },
          eventType: {
            type: "string",
            enum: [
              "conference",
              "workshop",
              "meetup",
              "social",
              "corporate",
              "other",
            ],
            description: "Type of event (default: other)",
          },
          speakerCount: {
            type: "number",
            description: "Number of speakers (default: 1)",
          },
        },
        required: ["title", "durationMinutes"],
      },
    }
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────

export function buildAgentTools(userId: string, userEmail: string, userName?: string) {
  return [
    createSearchEventsTool(),
    createGetMyScheduleTool(userId),
    createCheckConflictsTool(userId),
    createCreateEventTool(userId),
    createInvitePeopleTool(userId, userEmail, userName),
    createSuggestMeetingTimeTool(),
    createBuildAgendaTool(),
  ];
}
