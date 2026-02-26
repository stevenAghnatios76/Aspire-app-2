"use client";

import { useEffect } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useAI } from "@/hooks/useAI";
import { AlertTriangle, Loader2 } from "lucide-react";
import { formatDateTime } from "@/utils/dates";

interface Conflict {
  eventId: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  overlapMinutes: number;
}

interface Resolution {
  type: string;
  description: string;
  suggestedTime: { start: string; end: string } | null;
  reasoning: string;
}

interface ConflictResponse {
  hasConflicts: boolean;
  conflicts: Conflict[];
  resolutions: Resolution[];
}

interface ConflictAlertProps {
  startDateTime: string;
  endDateTime: string;
  eventTitle?: string;
}

export function ConflictAlert({ startDateTime, endDateTime, eventTitle }: ConflictAlertProps) {
  const { data, loading, error, execute } = useAI<
    Record<string, unknown>,
    ConflictResponse
  >("/api/ai/check-conflicts");

  useEffect(() => {
    if (!startDateTime || !endDateTime) return;

    // Debounce the check
    const timeout = setTimeout(() => {
      execute({ startDateTime, endDateTime, eventTitle });
    }, 1000);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDateTime, endDateTime]);

  if (loading) {
    return (
      <Alert>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertTitle>Checking for conflicts...</AlertTitle>
      </Alert>
    );
  }

  if (error) return null; // Silently fail

  if (!data || !data.hasConflicts) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Scheduling Conflicts Detected</AlertTitle>
      <AlertDescription>
        <div className="mt-2 space-y-3">
          {data.conflicts.map((conflict) => (
            <div key={conflict.eventId} className="text-sm">
              <span className="font-medium">{conflict.title}</span>
              <span className="text-muted-foreground ml-2">
                ({formatDateTime(conflict.startDateTime)} — {conflict.overlapMinutes}min overlap)
              </span>
            </div>
          ))}

          {data.resolutions.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-medium">Suggestions:</p>
              {data.resolutions.map((res, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Badge variant="outline" className="shrink-0 text-xs">
                    {res.type}
                  </Badge>
                  <span>{res.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
