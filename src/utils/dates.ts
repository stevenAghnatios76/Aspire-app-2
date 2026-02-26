import { format, formatDistanceToNow, isAfter, isBefore, parseISO } from "date-fns";

export function formatDateTime(isoString: string): string {
  return format(parseISO(isoString), "MMM d, yyyy 'at' h:mm a");
}

export function formatDate(isoString: string): string {
  return format(parseISO(isoString), "MMM d, yyyy");
}

export function formatTime(isoString: string): string {
  return format(parseISO(isoString), "h:mm a");
}

export function formatRelative(isoString: string): string {
  return formatDistanceToNow(parseISO(isoString), { addSuffix: true });
}

export function isUpcoming(isoString: string): boolean {
  return isAfter(parseISO(isoString), new Date());
}

export function isPast(isoString: string): boolean {
  return isBefore(parseISO(isoString), new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function hasTimeOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const sA = new Date(startA).getTime();
  const eA = new Date(endA).getTime();
  const sB = new Date(startB).getTime();
  const eB = new Date(endB).getTime();
  return sA < eB && eA > sB;
}
