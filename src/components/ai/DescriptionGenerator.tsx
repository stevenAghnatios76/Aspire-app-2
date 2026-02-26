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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAI } from "@/hooks/useAI";
import { Sparkles, Loader2 } from "lucide-react";

interface DescriptionResponse {
  description: string;
  alternates: string[];
}

interface DescriptionGeneratorProps {
  title: string;
  onGenerated: (description: string) => void;
}

export function DescriptionGenerator({ title, onGenerated }: DescriptionGeneratorProps) {
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState("professional");
  const [details, setDetails] = useState("");
  const [eventType, setEventType] = useState("other");

  const { data, loading, error, execute, reset } = useAI<
    Record<string, unknown>,
    DescriptionResponse
  >("/api/ai/generate-description");

  const handleGenerate = async () => {
    if (!title) return;
    await execute({
      title,
      tone,
      details: details || undefined,
      eventType,
      maxLength: 500,
    });
  };

  const handleUse = (text: string) => {
    onGenerated(text);
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={!title}>
          <Sparkles className="mr-1 h-4 w-4" />
          AI Generate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Generate Description
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Event Type</Label>
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="corporate">Corporate</SelectItem>
                <SelectItem value="social">Social</SelectItem>
                <SelectItem value="workshop">Workshop</SelectItem>
                <SelectItem value="meetup">Meetup</SelectItem>
                <SelectItem value="party">Party</SelectItem>
                <SelectItem value="conference">Conference</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="fun">Fun</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Additional Details (optional)</Label>
            <Textarea
              placeholder="Key points, speakers, agenda..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
            />
          </div>

          <Button onClick={handleGenerate} disabled={loading || !title} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              "Generate Description"
            )}
          </Button>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {data && (
            <div className="space-y-3">
              <div className="rounded-md border p-3">
                <p className="text-sm">{data.description}</p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => handleUse(data.description)}
                >
                  Use this
                </Button>
              </div>

              {data.alternates?.map((alt, i) => (
                <div key={i} className="rounded-md border border-dashed p-3">
                  <p className="text-xs text-muted-foreground mb-1">Alternate {i + 1}</p>
                  <p className="text-sm">{alt}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => handleUse(alt)}
                  >
                    Use this
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
