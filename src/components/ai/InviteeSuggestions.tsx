"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAI } from "@/hooks/useAI";
import { apiRequest } from "@/lib/api-client";
import { UserPlus, Sparkles, Loader2, Send } from "lucide-react";

interface SuggestedUser {
  userId: string;
  relevanceScore: number;
  reason: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
}

interface SuggestResponse {
  suggestions: SuggestedUser[];
}

interface InviteeSuggestionsProps {
  eventId: string;
  eventTitle: string;
  eventDescription?: string;
  tags?: string[];
  alreadyInvited: string[];
}

export function InviteeSuggestions({
  eventId,
  eventTitle,
  eventDescription,
  tags,
  alreadyInvited,
}: InviteeSuggestionsProps) {
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<string | null>(null);

  const { data, loading, error, execute } = useAI<
    Record<string, unknown>,
    SuggestResponse
  >("/api/ai/suggest-invitees");

  const handleSuggest = async () => {
    await execute({
      eventTitle,
      eventDescription,
      tags,
      alreadyInvited: [...alreadyInvited, ...Array.from(invitedIds)],
      maxSuggestions: 5,
    });
  };

  const handleInvite = async (suggestion: SuggestedUser) => {
    setInviting(suggestion.userId);
    try {
      await apiRequest(`/api/events/${eventId}/invite`, {
        method: "POST",
        body: JSON.stringify({
          emails: [suggestion.user.email],
          message: `You're invited based on your involvement in similar events!`,
        }),
      });
      setInvitedIds((prev) => new Set(prev).add(suggestion.userId));
    } catch {
      // handle silently
    } finally {
      setInviting(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite People
          </CardTitle>
          <Button variant="outline" size="sm" onClick={handleSuggest} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                Finding...
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-4 w-4" />
                Suggest People
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}

        {data?.suggestions && data.suggestions.length > 0 ? (
          <div className="space-y-3">
            {data.suggestions.map((suggestion) => {
              const isInvited = invitedIds.has(suggestion.userId);
              return (
                <div key={suggestion.userId} className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={suggestion.user.avatarUrl} />
                    <AvatarFallback>
                      {suggestion.user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{suggestion.user.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(suggestion.relevanceScore * 100)}% match
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {suggestion.reason}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={isInvited ? "secondary" : "default"}
                    onClick={() => handleInvite(suggestion)}
                    disabled={isInvited || inviting === suggestion.userId}
                  >
                    {isInvited ? (
                      "Invited"
                    ) : inviting === suggestion.userId ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="mr-1 h-3 w-3" />
                        Invite
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : data?.suggestions && data.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No suggestions available. Try adding tags to your event.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Click &quot;Suggest People&quot; to get AI-powered invitee recommendations.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
