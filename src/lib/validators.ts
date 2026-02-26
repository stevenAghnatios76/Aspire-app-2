import { z } from "zod";

// --- Auth ---

export const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
});

// --- Events ---

export const CreateEventSchema = z
  .object({
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
  })
  .refine((data) => new Date(data.endDateTime) > new Date(data.startDateTime), {
    message: "End time must be after start time",
  });

export const UpdateEventSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    startDateTime: z.string().datetime().optional(),
    endDateTime: z.string().datetime().optional(),
    location: z.string().max(500).optional(),
    isVirtual: z.boolean().optional(),
    virtualLink: z.string().url().optional(),
    coverImageUrl: z.string().url().optional(),
    maxAttendees: z.number().int().positive().optional(),
    isPublic: z.boolean().optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
  })
  .refine(
    (data) => {
      if (data.startDateTime && data.endDateTime) {
        return new Date(data.endDateTime) > new Date(data.startDateTime);
      }
      return true;
    },
    { message: "End time must be after start time" }
  );

export const RsvpSchema = z.object({
  status: z.enum(["UPCOMING", "ATTENDING", "MAYBE", "DECLINED"]),
});

export const InviteSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(50),
  message: z.string().max(1000).optional(),
});

// --- AI Features ---

export const GenerateDescriptionSchema = z.object({
  title: z.string().min(1).max(200),
  eventType: z
    .enum(["corporate", "social", "workshop", "meetup", "party", "conference", "other"])
    .optional(),
  details: z.string().max(1000).optional(),
  tone: z.enum(["professional", "casual", "fun", "formal"]).default("professional"),
  maxLength: z.number().int().min(50).max(2000).default(500),
});

export const CheckConflictsSchema = z.object({
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
  eventTitle: z.string().max(200).optional(),
});

export const SuggestTimeSchema = z.object({
  title: z.string().min(1).max(200),
  attendeeIds: z.array(z.string()).min(1).max(50),
  preferredDateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  durationMinutes: z.number().int().min(15).max(480),
  preferences: z
    .object({
      avoidWeekends: z.boolean().default(true),
      preferMorning: z.boolean().default(false),
      timezone: z.string().default("UTC"),
    })
    .optional(),
});

export const NlpSearchSchema = z.object({
  q: z.string().min(1).max(500),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const SuggestInviteesSchema = z.object({
  eventTitle: z.string().min(1).max(200),
  eventDescription: z.string().max(2000).optional(),
  tags: z.array(z.string()).max(10).optional(),
  alreadyInvited: z.array(z.string()).optional(),
  maxSuggestions: z.number().int().min(1).max(20).default(5),
});
