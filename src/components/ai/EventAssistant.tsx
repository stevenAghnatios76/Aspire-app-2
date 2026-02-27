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
import { apiRequest, getConversationHistory, clearConversationHistory } from "@/lib/api-client";
import {
  Bot,
  Send,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Trash2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  actionsPerformed?: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: string;
  }>;
  eventIds?: string[];
  timestamp: Date;
  error?: boolean;
}

interface AgentApiResponse {
  reply: string;
  toolsUsed: string[];
  actionsPerformed: Array<{
    tool: string;
    input: Record<string, unknown>;
    output: string;
  }>;
  eventIds?: string[];
}

// ─── Welcome Message ─────────────────────────────────────────────────────────

const WELCOME_MESSAGE: Message = {
  role: "assistant",
  content:
    "Hi! I'm your event assistant. I can help you create events, check your schedule, invite people, build agendas, and search for events. What would you like to do?",
  timestamp: new Date(),
};

// ─── Component ───────────────────────────────────────────────────────────────

export function EventAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const historyLoadedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch stored conversation history when the sheet is first opened
  useEffect(() => {
    if (!open || historyLoadedRef.current) return;
    historyLoadedRef.current = true;

    setHydrating(true);
    getConversationHistory()
      .then((storedMessages) => {
        if (storedMessages.length === 0) return;
        const restored: Message[] = storedMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: new Date(m.timestamp),
        }));
        // Prepend restored history after the welcome message
        setMessages([{ ...WELCOME_MESSAGE, timestamp: new Date() }, ...restored]);
      })
      .finally(() => setHydrating(false));
  }, [open]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Reset state when sheet closes
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // Reset to initial state on close
      setMessages([{ ...WELCOME_MESSAGE, timestamp: new Date() }]);
      setInput("");
      setLoading(false);
      setHydrating(false);
      historyLoadedRef.current = false;
    }
  }, []);

  // Build history from messages (excluding welcome message and errors)
  const buildHistory = useCallback(
    (msgs: Message[]) =>
      msgs
        .filter((m) => !m.error && m !== msgs[0]) // Skip welcome & errors
        .map((m) => ({
          role: m.role,
          content: m.content,
        })),
    []
  );

  // Send message to agent
  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = {
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const history = buildHistory([...messages, userMessage]);

      const response = await apiRequest<AgentApiResponse>("/api/ai/agent", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          history: history.slice(-18), // Keep last 18 turns to stay under limit of 20
        }),
      });

      const assistantMessage: Message = {
        role: "assistant",
        content: response.reply,
        toolsUsed: response.toolsUsed,
        actionsPerformed: response.actionsPerformed,
        eventIds: response.eventIds,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error ? error.message : "Something went wrong";
      const isRateLimit = errorMsg.includes("Rate limit") || errorMsg.includes("rate limit");

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: isRateLimit
            ? "You've reached the request limit. Please wait a moment before trying again."
            : `Sorry, I encountered an error: ${errorMsg}`,
          timestamp: new Date(),
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, buildHistory]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // Clear the entire chat (local + server)
  const clearChat = useCallback(async () => {
    setMessages([{ ...WELCOME_MESSAGE, timestamp: new Date() }]);
    setInput("");
    historyLoadedRef.current = false;
    try {
      await clearConversationHistory();
    } catch {
      // Best-effort: local state is already cleared
    }
  }, []);

  // Retry the last failed message
  const retryLastMessage = useCallback(() => {
    setMessages((prev) => {
      // Remove the last error message
      const withoutError = prev.filter(
        (_, i) => i !== prev.length - 1 || !prev[prev.length - 1].error
      );
      // Find the last user message to retry
      const lastUser = [...withoutError]
        .reverse()
        .find((m) => m.role === "user");
      if (lastUser) {
        setInput(lastUser.content);
      }
      return withoutError;
    });
  }, []);

  return (
    <>
      {/* Floating Action Button */}
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>
          <Button
            size="icon"
            className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
          >
            <Bot className="h-6 w-6" />
            <span className="sr-only">Open Event Assistant</span>
          </Button>
        </SheetTrigger>

        <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col">
          {/* Header */}
          <SheetHeader className="px-4 py-3 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2 text-left">
              <Bot className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <div className="text-base font-semibold">Event Assistant</div>
                <div className="text-xs text-muted-foreground font-normal">
                  
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={clearChat}
                disabled={loading || messages.length <= 1}
                title="Clear chat"
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Clear chat</span>
              </Button>
            </SheetTitle>
          </SheetHeader>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
            {/* History loading indicator */}
            {hydrating && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Restoring conversation…
              </div>
            )}

            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex items-start gap-2">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t px-4 py-3 shrink-0">
            {/* Retry button if last message was an error */}
            {messages[messages.length - 1]?.error && (
              <Button
                variant="outline"
                size="sm"
                className="mb-2 w-full"
                onClick={retryLastMessage}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Try again
              </Button>
            )}

            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send)"
                className="min-h-[40px] max-h-[120px] resize-none text-sm"
                rows={1}
                disabled={loading}
              />
              <Button
                size="icon"
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="shrink-0"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Message Bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : message.error
              ? "bg-destructive/10 border border-destructive/20"
              : "bg-muted"
        }`}
      >
        {/* Error indicator */}
        {message.error && (
          <div className="flex items-center gap-1 text-destructive mb-1">
            <AlertCircle className="h-3 w-3" />
            <span className="text-xs font-medium">Error</span>
          </div>
        )}

        {/* Message content */}
        <div className="whitespace-pre-wrap break-words">{message.content}</div>

        {/* Event links */}
        {message.eventIds && message.eventIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.eventIds.map((id) => (
              <Link key={id} href={`/events/${id}`}>
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:bg-secondary/80 gap-1"
                >
                  View Event
                  <ExternalLink className="h-3 w-3" />
                </Badge>
              </Link>
            ))}
          </div>
        )}

        {/* Tools used (collapsible) */}
        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="mt-2 border-t border-border/50 pt-2">
            <button
              onClick={() => setToolsExpanded(!toolsExpanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {toolsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {message.toolsUsed.length} tool
              {message.toolsUsed.length !== 1 ? "s" : ""} used
            </button>

            {toolsExpanded && (
              <div className="mt-1 space-y-0.5">
                {message.toolsUsed.map((tool) => (
                  <div
                    key={tool}
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <span className="text-green-500">✓</span>
                    <span className="font-mono">{tool}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-[10px] mt-1 ${
            isUser
              ? "text-primary-foreground/60"
              : "text-muted-foreground/60"
          }`}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
