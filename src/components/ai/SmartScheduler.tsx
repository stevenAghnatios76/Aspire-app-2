"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAI } from "@/hooks/useAI";
import { Clock, Loader2, Check } from "lucide-react";
import { formatDateTime } from "@/utils/dates";

interface TimeSuggestion {
  startDateTime: string;
  endDateTime: string;
  confidence: number;
  reason: string;
  availableAttendees: string[];
  conflictedAttendees: string[];
}

interface SuggestTimeResponse {
  suggestions: TimeSuggestion[];
}

interface SmartSchedulerProps {
  title: string;
  onTimeSelected: (start: string, end: string) => void;
}

export function SmartScheduler({ title, onTimeSelected }: SmartSchedulerProps) {
  const [open, setOpen] = useState(false);
  const [attendeeIds, setAttendeeIds] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [duration, setDuration] = useState("60");

  const { data, loading, error, execute, reset } = useAI<
    Record<string, unknown>,
    SuggestTimeResponse
  >("/api/ai/suggest-time");

  const handleSuggest = async () => {
    const ids = attendeeIds.split(",").map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0 || !dateFrom || !dateTo) return;

    await execute({
      title: title || "New Event",
      attendeeIds: ids,
      preferredDateRange: {
        from: new Date(dateFrom).toISOString(),
        to: new Date(dateTo).toISOString(),
      },
      durationMinutes: parseInt(duration),
      preferences: {
        avoidWeekends: true,
        preferMorning: false,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
  };

  const handleSelect = (suggestion: TimeSuggestion) => {
    onTimeSelected(suggestion.startDateTime, suggestion.endDateTime);
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          <Clock className="mr-1 h-4 w-4" />
          Suggest Time
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Smart Scheduling
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Attendee IDs (comma-separated)</Label>
            <Input
              placeholder="user1, user2, user3"
              value={attendeeIds}
              onChange={(e) => setAttendeeIds(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date From</Label>
              <Input
                type="datetime-local"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Date To</Label>
              <Input
                type="datetime-local"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              min="15"
              max="480"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>

          <Button
            onClick={handleSuggest}
            disabled={loading || !attendeeIds || !dateFrom || !dateTo}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Finding best times...
              </>
            ) : (
              "Find Best Times"
            )}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {data?.suggestions && (
            <div className="space-y-3">
              {data.suggestions.map((suggestion, i) => (
                <div
                  key={i}
                  className="rounded-md border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleSelect(suggestion)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {formatDateTime(suggestion.startDateTime)}
                    </span>
                    <Badge variant={suggestion.confidence >= 0.8 ? "default" : "secondary"}>
                      {Math.round(suggestion.confidence * 100)}% match
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{suggestion.reason}</p>
                  <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                    <Check className="h-3 w-3" />
                    {suggestion.availableAttendees.length} available
                    {suggestion.conflictedAttendees.length > 0 && (
                      <span className="text-destructive ml-2">
                        {suggestion.conflictedAttendees.length} conflicts
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
