/**
 * Generates a Google Calendar "Add Event" URL from event details.
 * Opens in a new tab — no API keys or OAuth required.
 */

interface CalendarEventParams {
  title: string;
  startDateTime: string; // ISO 8601
  endDateTime: string;   // ISO 8601
  description?: string;
  location?: string;
  isVirtual?: boolean;
  virtualLink?: string;
}

/** Convert an ISO datetime string to the compact format Google Calendar expects: YYYYMMDDTHHmmssZ */
function toGoogleCalendarDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildGoogleCalendarUrl(event: CalendarEventParams): string {
  const base = "https://calendar.google.com/calendar/render";

  const dates = `${toGoogleCalendarDate(event.startDateTime)}/${toGoogleCalendarDate(event.endDateTime)}`;

  // Build description — append virtual link if present
  let description = event.description ?? "";
  if (event.isVirtual && event.virtualLink) {
    description += description ? `\n\nJoin online: ${event.virtualLink}` : `Join online: ${event.virtualLink}`;
  }

  const location = event.isVirtual
    ? event.virtualLink ?? "Online"
    : event.location ?? "";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates,
    details: description,
    location,
  });

  return `${base}?${params.toString()}`;
}
