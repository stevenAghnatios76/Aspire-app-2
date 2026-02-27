"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DescriptionGenerator } from "@/components/ai/DescriptionGenerator";
import { AgendaBuilder } from "@/components/ai/AgendaBuilder";
import { SmartScheduler } from "@/components/ai/SmartScheduler";
import { ConflictAlert } from "@/components/ai/ConflictAlert";
import { Loader2 } from "lucide-react";

export default function EditEventPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDateTime, setStartDateTime] = useState("");
  const [endDateTime, setEndDateTime] = useState("");
  const [location, setLocation] = useState("");
  const [isVirtual, setIsVirtual] = useState(false);
  const [virtualLink, setVirtualLink] = useState("");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [tags, setTags] = useState("");

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const event = await apiRequest<any>(`/api/events/${eventId}`);
        
        // Format dates for datetime-local input (YYYY-MM-DDThh:mm)
        const formatForInput = (isoString: string) => {
          const date = new Date(isoString);
          return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16);
        };

        setTitle(event.title || "");
        setDescription(event.description || "");
        setStartDateTime(formatForInput(event.startDateTime));
        setEndDateTime(formatForInput(event.endDateTime));
        setLocation(event.location || "");
        setIsVirtual(event.isVirtual || false);
        setVirtualLink(event.virtualLink || "");
        setMaxAttendees(event.maxAttendees ? event.maxAttendees.toString() : "");
        setIsPublic(event.isPublic ?? true);
        setTags(event.tags ? event.tags.map((t: any) => t.name).join(", ") : "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load event");
      } finally {
        setFetching(false);
      }
    };

    if (eventId) {
      fetchEvent();
    }
  }, [eventId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const body: Record<string, unknown> = {
        title,
        description: description || undefined,
        startDateTime: new Date(startDateTime).toISOString(),
        endDateTime: new Date(endDateTime).toISOString(),
        location: location || undefined,
        isVirtual,
        virtualLink: virtualLink || undefined,
        maxAttendees: maxAttendees ? parseInt(maxAttendees) : undefined,
        isPublic,
        tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
      };

      await apiRequest(`/api/events/${eventId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });

      router.push(`/events/${eventId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update event");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Edit Event</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Event title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="description">Description</Label>
                <div className="flex gap-1">
                  <DescriptionGenerator
                    title={title}
                    onGenerated={setDescription}
                  />
                  <AgendaBuilder
                    title={title}
                    description={description}
                    startDateTime={startDateTime ? new Date(startDateTime).toISOString() : ""}
                    endDateTime={endDateTime ? new Date(endDateTime).toISOString() : ""}
                    onGenerated={setDescription}
                  />
                </div>
              </div>
              <Textarea
                id="description"
                placeholder="Event description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={5000}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDateTime">Start Time</Label>
                <Input
                  id="startDateTime"
                  type="datetime-local"
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDateTime">End Time</Label>
                <Input
                  id="endDateTime"
                  type="datetime-local"
                  value={endDateTime}
                  onChange={(e) => setEndDateTime(e.target.value)}
                  required
                />
              </div>
            </div>

            {startDateTime && endDateTime && (
              <ConflictAlert
                startDateTime={startDateTime}
                endDateTime={endDateTime}
                eventId={eventId}
              />
            )}

            <div className="pt-2">
              <SmartScheduler
                onTimeSelected={(start, end) => {
                  setStartDateTime(start);
                  setEndDateTime(end);
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Location & Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isVirtual"
                checked={isVirtual}
                onChange={(e) => setIsVirtual(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isVirtual">This is a virtual event</Label>
            </div>

            {isVirtual ? (
              <div className="space-y-2">
                <Label htmlFor="virtualLink">Meeting Link</Label>
                <Input
                  id="virtualLink"
                  type="url"
                  placeholder="https://zoom.us/j/..."
                  value={virtualLink}
                  onChange={(e) => setVirtualLink(e.target.value)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="Physical address or room"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={500}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxAttendees">Max Attendees (Optional)</Label>
                <Input
                  id="maxAttendees"
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={maxAttendees}
                  onChange={(e) => setMaxAttendees(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (Comma separated)</Label>
                <Input
                  id="tags"
                  placeholder="work, social, planning"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <input
                type="checkbox"
                id="isPublic"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isPublic">Make event public (visible in search)</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
