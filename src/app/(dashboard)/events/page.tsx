"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, MapPin, Monitor, Users } from "lucide-react";
import { formatDateTime } from "@/utils/dates";
import { NlpSearchBar } from "@/components/ai/NlpSearchBar";

interface EventSummary {
  id: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  isVirtual: boolean;
  createdBy: { id: string; name: string };
  responseCount: { attending: number; maybe: number; declined: number };
  myStatus: string | null;
  tags: Array<{ name: string }>;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("upcoming");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ data: EventSummary[] }>(
        `/api/events?filter=${filter}`
      );
      setEvents(res.data);
    } catch {
      // handle error silently
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Link href="/events/create">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create Event
          </Button>
        </Link>
      </div>

      <NlpSearchBar />

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24" />
            </Card>
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-muted-foreground">No events found</p>
            <Link href="/events/create" className="mt-4">
              <Button variant="outline">Create your first event</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{event.title}</CardTitle>
                    <div className="flex gap-1">
                      {event.myStatus && (
                        <Badge variant={event.myStatus === "ATTENDING" ? "default" : "secondary"}>
                          {event.myStatus}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    <span>{formatDateTime(event.startDateTime)}</span>
                    {event.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {event.location}
                      </span>
                    )}
                    {event.isVirtual && (
                      <span className="flex items-center gap-1">
                        <Monitor className="h-3 w-3" />
                        Virtual
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {event.responseCount.attending} attending
                    </span>
                  </div>
                  {event.tags.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {event.tags.map((tag) => (
                        <Badge key={tag.name} variant="outline" className="text-xs">
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
