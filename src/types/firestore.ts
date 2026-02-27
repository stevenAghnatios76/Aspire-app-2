// Firestore document type interfaces

export interface UserDoc {
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string; // ISO datetime
}

export type RsvpStatus = "UPCOMING" | "ATTENDING" | "MAYBE" | "DECLINED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export interface EventRecap {
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
}

export interface EventDoc {
  title: string;
  description?: string;
  startDateTime: string; // ISO datetime
  endDateTime: string;   // ISO datetime
  location?: string;
  isVirtual: boolean;
  virtualLink?: string;
  coverImageUrl?: string;
  maxAttendees?: number;
  isPublic: boolean;
  createdById: string;
  tagNames: string[];
  createdAt: string;
  updatedAt: string;
  recap?: EventRecap;
}

export interface EventResponseDoc {
  eventId: string;
  userId: string;
  status: RsvpStatus;
  eventStartDateTime: string; // Denormalized for conflict queries
  eventEndDateTime: string;   // Denormalized for conflict queries
  respondedAt: string;
  updatedAt: string;
}

export interface InvitationDoc {
  eventId: string;
  inviterId: string;
  inviteeEmail: string;
  inviteeId?: string;
  status: InvitationStatus;
  message?: string;
  sentAt: string;
  respondedAt?: string;
  token: string;
}

export interface TagDoc {
  name: string;
}

// API response types
export interface EventWithMeta extends EventDoc {
  id: string;
  createdBy: { id: string; name: string; avatarUrl?: string };
  tags: { id: string; name: string }[];
  responseCount?: { attending: number; maybe: number; declined: number };
  myStatus?: RsvpStatus | null;
  isOwner?: boolean;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// --- Dashboard Analytics ---

export interface DashboardAnalytics {
  eventsCreated: number;
  eventsCreatedDelta: number; // change vs prior period
  rsvpBreakdown: {
    attending: number;
    maybe: number;
    declined: number;
    upcoming: number;
  };
  attendanceRate: number; // 0-100
  attendanceRateDelta: number;
  eventsTrend: Array<{ period: string; count: number }>;
  attendanceTrend: Array<{ period: string; rate: number }>;
  topTags: Array<{ name: string; count: number }>;
  upcomingCount: number;
  totalResponses: number;
}

export interface WeeklySummaryResponse {
  summary: string;
  highlights: string[];
  suggestion: string;
}
