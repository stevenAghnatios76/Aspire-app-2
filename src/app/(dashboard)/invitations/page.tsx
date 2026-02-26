"use client";

import { useEffect, useState, useCallback } from "react";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/utils/dates";
import { MapPin, Check, X } from "lucide-react";

interface Invitation {
  id: string;
  event: {
    id: string;
    title: string;
    startDateTime: string;
    location?: string;
  } | null;
  inviter: { id: string; name: string };
  message?: string;
  status: string;
  sentAt: string;
}

export default function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("PENDING");
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ data: Invitation[] }>(
        `/api/invitations?status=${filter}`
      );
      setInvitations(res.data);
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const handleRespond = async (invitationId: string, status: "ACCEPTED" | "DECLINED") => {
    setRespondingId(invitationId);
    try {
      await apiRequest(`/api/invitations/${invitationId}/respond`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      fetchInvitations();
    } catch {
      // handle silently
    } finally {
      setRespondingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Invitations</h1>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="ACCEPTED">Accepted</TabsTrigger>
          <TabsTrigger value="DECLINED">Declined</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-20" />
            </Card>
          ))}
        </div>
      ) : invitations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No {filter.toLowerCase()} invitations
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invitations.map((inv) => (
            <Card key={inv.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      {inv.event?.title || "Unknown Event"}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Invited by {inv.inviter.name}
                    </p>
                  </div>
                  <Badge variant={inv.status === "PENDING" ? "default" : "secondary"}>
                    {inv.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {inv.event && (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>{formatDateTime(inv.event.startDateTime)}</span>
                    {inv.event.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {inv.event.location}
                      </span>
                    )}
                  </div>
                )}

                {inv.message && (
                  <p className="mt-2 text-sm italic">&quot;{inv.message}&quot;</p>
                )}

                {inv.status === "PENDING" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleRespond(inv.id, "ACCEPTED")}
                      disabled={respondingId === inv.id}
                    >
                      <Check className="mr-1 h-4 w-4" />
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRespond(inv.id, "DECLINED")}
                      disabled={respondingId === inv.id}
                    >
                      <X className="mr-1 h-4 w-4" />
                      Decline
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
