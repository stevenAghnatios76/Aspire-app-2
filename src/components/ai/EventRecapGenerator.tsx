"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAI } from "@/hooks/useAI";
import { FileText, Loader2, Copy, CheckCircle, Eye } from "lucide-react";
import { EventRecap } from "@/types/firestore";

interface EventRecapGeneratorProps {
  eventId: string;
  eventTitle: string;
  existingRecap?: EventRecap;
}

export function EventRecapGenerator({
  eventId,
  eventTitle,
  existingRecap,
}: EventRecapGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [includeNames, setIncludeNames] = useState(false);

  const { data, loading, error, execute, reset } = useAI<
    { eventId: string; includeAttendeeNames: boolean },
    EventRecap
  >("/api/ai/generate-recap");

  const recap = existingRecap || data;

  const handleGenerate = async () => {
    setOpen(true);
    if (!existingRecap) {
      await execute({ eventId, includeAttendeeNames: includeNames });
    }
  };

  const handleCopy = async () => {
    if (!recap?.shareableText) return;
    try {
      await navigator.clipboard.writeText(recap.shareableText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  };

  return (
    <>
      <Button
        variant={existingRecap ? "outline" : "default"}
        size="sm"
        className="gap-2"
        onClick={handleGenerate}
      >
        {existingRecap ? (
          <>
            <Eye className="h-4 w-4" />
            View Recap
          </>
        ) : (
          <>
            <FileText className="h-4 w-4" />
            Generate Recap
          </>
        )}
      </Button>

      {!existingRecap && !open && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="checkbox"
            id="includeNames"
            checked={includeNames}
            onChange={(e) => setIncludeNames(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          <label htmlFor="includeNames" className="text-xs text-muted-foreground">
            Include attendee names in recap
          </label>
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v && !existingRecap) reset();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Event Recap — {eventTitle}</DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing event data...</p>
            </div>
          )}

          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {recap && (
            <Tabs defaultValue="summary" className="mt-2">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="highlights">Highlights</TabsTrigger>
                <TabsTrigger value="followups">Follow-Ups</TabsTrigger>
                <TabsTrigger value="share">Share</TabsTrigger>
              </TabsList>

              <TabsContent value="summary" className="space-y-4 mt-4">
                <p className="text-sm leading-relaxed">{recap.summary}</p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{recap.attendanceInsights.totalAttended}</p>
                    <p className="text-xs text-muted-foreground">Attended</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{recap.attendanceInsights.totalInvited}</p>
                    <p className="text-xs text-muted-foreground">Invited</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">
                      {(recap.attendanceInsights.attendanceRate * 100).toFixed(0)}%
                    </p>
                    <p className="text-xs text-muted-foreground">Attendance Rate</p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-2xl font-bold">{recap.attendanceInsights.totalDeclined}</p>
                    <p className="text-xs text-muted-foreground">Declined</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground italic">
                  {recap.attendanceInsights.engagementNarrative}
                </p>
              </TabsContent>

              <TabsContent value="highlights" className="mt-4">
                <ul className="space-y-2">
                  {recap.highlights.map((highlight, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Badge variant="secondary" className="mt-0.5 shrink-0 text-xs">
                        {i + 1}
                      </Badge>
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="followups" className="mt-4">
                <ul className="space-y-2">
                  {recap.followUpActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="shrink-0 text-primary">→</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="share" className="mt-4 space-y-3">
                <div className="rounded-lg border bg-muted/50 p-4">
                  <p className="whitespace-pre-wrap text-sm">{recap.shareableText}</p>
                </div>
                <Button onClick={handleCopy} variant="outline" className="w-full gap-2">
                  {copied ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy to Clipboard
                    </>
                  )}
                </Button>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
