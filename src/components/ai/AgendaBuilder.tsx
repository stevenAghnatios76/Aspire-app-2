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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAI } from "@/hooks/useAI";
import { List, Loader2, CheckCircle } from "lucide-react";

interface AgendaItem {
  startOffset: number;
  endOffset: number;
  title: string;
  description: string;
  type: "session" | "break" | "networking" | "keynote" | "workshop" | "qa" | "closing";
  speaker?: string;
}

interface AgendaResponse {
  agenda: AgendaItem[];
  formattedText: string;
}

interface AgendaBuilderProps {
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  onGenerated: (text: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  session: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  break: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  networking: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  keynote: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  workshop: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  qa: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  closing: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

function formatOffset(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

export function AgendaBuilder({
  title,
  description,
  startDateTime,
  endDateTime,
  onGenerated,
}: AgendaBuilderProps) {
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState("other");
  const [speakerCount, setSpeakerCount] = useState("1");
  const [includeBreaks, setIncludeBreaks] = useState(true);

  const { data, loading, error, execute, reset } = useAI<
    Record<string, unknown>,
    AgendaResponse
  >("/api/ai/build-agenda");

  const isDisabled = !startDateTime || !endDateTime;

  const handleBuild = async () => {
    if (!title || isDisabled) return;
    await execute({
      title,
      description: description || undefined,
      startDateTime,
      endDateTime,
      eventType,
      speakerCount: speakerCount ? parseInt(speakerCount) : undefined,
      includeBreaks,
    });
  };

  // Filter out incomplete items from truncated JSON repair
  const completeAgenda = (data?.agenda ?? []).filter(
    (item) => item.title && item.description && item.startOffset != null && item.endOffset != null
  );

  const handleUseAsDescription = () => {
    if (!data) return;

    // Use formattedText from the API when available; otherwise build it
    // from the complete agenda items (covers truncated responses where
    // formattedText was lost during JSON repair).
    const text =
      data.formattedText ||
      completeAgenda
        .map(
          (item) =>
            `${formatOffset(item.startOffset)} – ${formatOffset(item.endOffset)}  **${item.title}**\n${item.description}${item.speaker ? ` _(${item.speaker})_` : ""}`
        )
        .join("\n\n") ||
      "";

    if (text) {
      onGenerated(text);
      setOpen(false);
      reset();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-xs"
          disabled={isDisabled}
          title={isDisabled ? "Set start and end times first" : "Build an AI agenda"}
        >
          <List className="h-3.5 w-3.5" />
          Build Agenda
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>AI Agenda Builder</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Event Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conference">Conference</SelectItem>
                <SelectItem value="workshop">Workshop</SelectItem>
                <SelectItem value="meetup">Meetup</SelectItem>
                <SelectItem value="social">Social</SelectItem>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="speakerCount">Number of Speakers</Label>
            <Input
              id="speakerCount"
              type="number"
              min="1"
              max="50"
              value={speakerCount}
              onChange={(e) => setSpeakerCount(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="includeBreaks"
              checked={includeBreaks}
              onChange={(e) => setIncludeBreaks(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="includeBreaks">Include breaks</Label>
          </div>

          <Button
            onClick={handleBuild}
            disabled={loading || !title}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Building agenda...
              </>
            ) : (
              "Build Agenda"
            )}
          </Button>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {data && completeAgenda.length > 0 && (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 space-y-2">
                {completeAgenda.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5">
                    <span className="min-w-[80px] text-xs font-mono text-muted-foreground">
                      {formatOffset(item.startOffset)} – {formatOffset(item.endOffset)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{item.title}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            TYPE_COLORS[item.type] || TYPE_COLORS.session
                          }`}
                        >
                          {item.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.description}
                      </p>
                      {item.speaker && (
                        <p className="text-xs text-muted-foreground italic">
                          Speaker: {item.speaker}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={handleUseAsDescription} className="w-full gap-2">
                <CheckCircle className="h-4 w-4" />
                Use as Description
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
