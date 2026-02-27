"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/api-client";
import {
  Mic,
  MicOff,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Square,
} from "lucide-react";

type VoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "success"
  | "clarification"
  | "error";

interface ExtractedEvent {
  title?: string;
  description?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  isVirtual?: boolean;
  tagNames?: string[];
}

interface ReadyResult {
  status: "ready";
  extractedEvent: ExtractedEvent;
  summary: string;
  createdEventId: string;
}

interface ClarificationResult {
  status: "needs_clarification";
  extractedEvent: Partial<ExtractedEvent>;
  missingFields: string[];
  clarificationPrompt: string;
}

type VoiceResult = ReadyResult | ClarificationResult;

// Extend Window for SpeechRecognition
interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as Record<string, unknown>).SpeechRecognition as new () => SpeechRecognitionInstance ||
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition as new () => SpeechRecognitionInstance ||
    null
  );
}

export function VoiceEventCreator() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [textInput, setTextInput] = useState("");
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [priorContext, setPriorContext] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    setSpeechSupported(getSpeechRecognition() !== null);
  }, []);

  const resetState = useCallback(() => {
    setState("idle");
    setTranscript("");
    setTextInput("");
    setResult(null);
    setErrorMsg("");
    setPriorContext("");
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  }, []);

  const submitTranscript = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setState("processing");

      const fullTranscript = priorContext
        ? `${priorContext}\n\nAdditional context: ${text}`
        : text;

      try {
        const res = await apiRequest<VoiceResult>("/api/ai/voice-create-event", {
          method: "POST",
          body: JSON.stringify({ transcript: fullTranscript }),
        });

        setResult(res);

        if (res.status === "ready") {
          setState("success");
        } else {
          setState("clarification");
          // Save context for follow-up
          setPriorContext(fullTranscript);
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to process. Please try again."
        );
        setState("error");
      }
    },
    [priorContext]
  );

  const startListening = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const lastResult = e.results[e.results.length - 1];
      setTranscript(lastResult[0].transcript);
    };

    recognition.onerror = (e: { error: string }) => {
      if (e.error === "no-speech") {
        setState("idle");
        return;
      }
      setErrorMsg("Microphone access denied or not supported.");
      setState("error");
    };

    recognition.onend = () => {
      // Auto-submit if we have a transcript
      if (recognitionRef.current) {
        recognitionRef.current = null;
        setTranscript((prev) => {
          if (prev.trim()) {
            submitTranscript(prev);
          } else {
            setState("idle");
          }
          return prev;
        });
      }
    };

    setState("listening");
    setTranscript("");
    recognition.start();
  }, [submitTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      submitTranscript(textInput.trim());
      setTextInput("");
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetState();
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Mic className="h-4 w-4" />
          Voice
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[70vh] sm:h-auto sm:max-h-[600px]">
        <SheetHeader>
          <SheetTitle>Create Event by Voice</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center justify-center gap-6 py-8">
          {/* Idle State */}
          {state === "idle" && (
            <>
              {speechSupported ? (
                <>
                  <button
                    onClick={startListening}
                    className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105 active:scale-95"
                  >
                    <Mic className="h-10 w-10" />
                  </button>
                  <p className="text-sm text-muted-foreground">
                    Tap to speak, or type below
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MicOff className="h-4 w-4" />
                  Voice not supported in this browser
                </div>
              )}

              <div className="w-full max-w-md space-y-2">
                <Textarea
                  placeholder='Try: "Schedule a team lunch next Friday at noon for 10 people at the office"'
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleTextSubmit();
                    }
                  }}
                />
                <Button
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim()}
                  className="w-full"
                >
                  Create Event
                </Button>
              </div>
            </>
          )}

          {/* Listening State */}
          {state === "listening" && (
            <>
              <div className="relative flex h-24 w-24 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
                <span className="absolute inset-2 animate-pulse rounded-full bg-primary/20" />
                <button
                  onClick={stopListening}
                  className="relative z-10 flex h-24 w-24 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <Square className="h-8 w-8" />
                </button>
              </div>
              <p className="text-sm font-medium text-primary">Listening...</p>
              {transcript && (
                <p className="max-w-md text-center text-sm text-muted-foreground italic">
                  &ldquo;{transcript}&rdquo;
                </p>
              )}
              <Button variant="outline" size="sm" onClick={stopListening}>
                Stop & Process
              </Button>
            </>
          )}

          {/* Processing State */}
          {state === "processing" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Creating your event...
              </p>
            </>
          )}

          {/* Success State */}
          {state === "success" && result?.status === "ready" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center space-y-2">
                <p className="font-medium">{result.summary}</p>
                <Link href={`/events/${result.createdEventId}`}>
                  <Button className="gap-2 mt-2">
                    View Event <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
              <Button variant="ghost" size="sm" onClick={resetState}>
                Create another
              </Button>
            </>
          )}

          {/* Clarification State */}
          {state === "clarification" && result?.status === "needs_clarification" && (
            <>
              <AlertCircle className="h-10 w-10 text-yellow-500" />
              <div className="text-center space-y-2 max-w-md">
                <p className="text-sm font-medium">Almost there!</p>
                <p className="text-sm text-muted-foreground">
                  {result.clarificationPrompt}
                </p>

                {/* Show what was understood */}
                {result.extractedEvent && Object.keys(result.extractedEvent).length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-center mt-2">
                    {result.extractedEvent.title && (
                      <Badge variant="secondary">Title: {result.extractedEvent.title}</Badge>
                    )}
                    {result.extractedEvent.startDateTime && (
                      <Badge variant="secondary">
                        Start: {new Date(result.extractedEvent.startDateTime).toLocaleString()}
                      </Badge>
                    )}
                    {result.extractedEvent.isVirtual !== undefined && (
                      <Badge variant="secondary">
                        {result.extractedEvent.isVirtual ? "Virtual" : "In-person"}
                      </Badge>
                    )}
                  </div>
                )}

                {result.missingFields.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Missing: {result.missingFields.join(", ")}
                  </p>
                )}
              </div>

              {/* Follow-up input */}
              <div className="w-full max-w-md space-y-2">
                {speechSupported && (
                  <Button
                    variant="outline"
                    onClick={startListening}
                    className="w-full gap-2"
                  >
                    <Mic className="h-4 w-4" />
                    Speak to clarify
                  </Button>
                )}
                <Textarea
                  placeholder="Type clarification here..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleTextSubmit();
                    }
                  }}
                />
                <Button
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim()}
                  className="w-full"
                >
                  Submit
                </Button>
              </div>
            </>
          )}

          {/* Error State */}
          {state === "error" && (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <p className="text-sm text-destructive">{errorMsg}</p>
              <div className="w-full max-w-md space-y-2">
                <Textarea
                  placeholder="Type your event description instead..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleTextSubmit();
                    }
                  }}
                />
                <Button
                  onClick={handleTextSubmit}
                  disabled={!textInput.trim()}
                  className="w-full"
                >
                  Create Event
                </Button>
                <Button variant="ghost" onClick={resetState} className="w-full">
                  Try again
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
