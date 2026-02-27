"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MapPin, Monitor, Calendar, Clock, Users, Trash2, Edit, CalendarPlus } from "lucide-react";
import { formatDate, formatTime } from "@/utils/dates";
import { buildGoogleCalendarUrl } from "@/utils/google-calendar";
import { InviteeSuggestions } from "@/components/ai/InviteeSuggestions";
import { EventRecapGenerator } from "@/components/ai/EventRecapGenerator";
import { AttendancePrediction } from "@/components/ai/AttendancePrediction";
import { EventWithMeta, EventRecap, RsvpStatus } from "@/types/firestore";

interface EventDetail extends EventWithMeta {
  responses: Array<{
    user: { id: string; name: string; avatarUrl?: string };
    status: string;
    respondedAt: string;
  }>;
  recap?: EventRecap;
}

export default function EventDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  useAuth(); // ensure auth context is available
  const router = useRouter();

  useEffect(() => {
    async function fetchEvent() {
      try {
        const data = await apiRequest<EventDetail>(`/api/events/${params.id}`);
        setEvent(data);
      } catch {
        router.push("/events");
      } finally {
        setLoading(false);
      }
    }
    fetchEvent();
  }, [params.id, router]);

  const handleRsvp = async (status: RsvpStatus) => {
    setRsvpLoading(true);
    try {
      await apiRequest(`/api/events/${params.id}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      // Refresh event data
      const data = await apiRequest<EventDetail>(`/api/events/${params.id}`);
      setEvent(data);
    } catch {
      // handle silently
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this event?")) return;
    try {
      await apiRequest(`/api/events/${params.id}`, { method: "DELETE" });
      router.push("/events");
    } catch {
      // handle silently
    }
  };

  if (loading) {
    return <div className="animate-pulse text-center py-12">Loading event...</div>;
  }

  if (!event) return null;

  const attendingCount = event.responses.filter((r) => r.status === "ATTENDING").length;
  const maybeCount = event.responses.filter((r) => r.status === "MAYBE").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <p className="text-muted-foreground">
            Created by {event.createdBy.name}
          </p>
        </div>
        {event.isOwner && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push(`/events/${params.id}/edit`)}>
              <Edit className="mr-1 h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="mr-1 h-4 w-4" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {formatDate(event.startDateTime)}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {formatTime(event.startDateTime)} - {formatTime(event.endDateTime)}
            </div>
            {event.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {event.location}
              </div>
            )}
            {event.isVirtual && (
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                Virtual
              </div>
            )}
          </div>

          {event.tagNames && event.tagNames.length > 0 && (
            <div className="flex gap-1">
              {event.tagNames.map((tag) => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>
          )}

          {event.description && (
            <>
              <Separator />
              <p className="whitespace-pre-wrap text-sm">{event.description}</p>
            </>
          )}

          <Separator />
          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <a
              href={buildGoogleCalendarUrl({
                title: event.title,
                startDateTime: event.startDateTime,
                endDateTime: event.endDateTime,
                description: event.description,
                location: event.location,
                isVirtual: event.isVirtual,
                virtualLink: event.virtualLink,
              })}
              target="_blank"
              rel="noopener noreferrer"
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add to Google Calendar
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* RSVP Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your RSVP</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {(["ATTENDING", "MAYBE", "DECLINED"] as RsvpStatus[]).map((status) => (
              <Button
                key={status}
                variant={event.myStatus === status ? "default" : "outline"}
                size="sm"
                onClick={() => handleRsvp(status)}
                disabled={rsvpLoading}
              >
                {status}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Attendance Prediction */}
      {event.isOwner && new Date(event.startDateTime) > new Date() && (
        <AttendancePrediction
          eventId={params.id}
          title={event.title}
          tags={event.tagNames || []}
          startDateTime={event.startDateTime}
          endDateTime={event.endDateTime}
          isVirtual={event.isVirtual}
          maxAttendees={event.maxAttendees}
          variant="card"
        />
      )}

      {/* Attendees */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Attendees ({attendingCount} attending, {maybeCount} maybe)
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {event.responses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No RSVPs yet</p>
          ) : (
            <div className="space-y-2">
              {event.responses.map((r) => (
                <div key={r.user.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={r.user.avatarUrl} />
                    <AvatarFallback>
                      {r.user.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{r.user.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Invitee Suggestions */}
      {event.isOwner && (
        <InviteeSuggestions
          eventId={params.id}
          eventTitle={event.title}
          eventDescription={event.description}
          tags={event.tagNames}
          alreadyInvited={event.responses.map((r) => r.user.id)}
        />
      )}

      {/* AI Post-Event Recap */}
      {event.isOwner && new Date(event.endDateTime) < new Date() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event Recap</CardTitle>
          </CardHeader>
          <CardContent>
            <EventRecapGenerator
              eventId={params.id}
              eventTitle={event.title}
              existingRecap={event.recap}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
