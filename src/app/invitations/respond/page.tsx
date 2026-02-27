"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Calendar, MapPin, Clock, Loader2, CalendarPlus } from "lucide-react";
import { format } from "date-fns";
import { buildGoogleCalendarUrl } from "@/utils/google-calendar";

export default function RespondPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No invitation token provided.");
      setLoading(false);
      return;
    }

    const fetchInvitation = async () => {
      try {
        const res = await fetch(`/api/invitations/respond?token=${token}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to load invitation");
        }
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const handleRespond = async (status: "ACCEPTED" | "DECLINED") => {
    if (!user) {
      // Redirect to login, then back here
      const currentUrl = encodeURIComponent(`/invitations/respond?token=${token}`);
      router.push(`/login?redirect=${currentUrl}`);
      return;
    }

    if (user.email !== data.invitation.inviteeEmail) {
      toast({
        title: "Email mismatch",
        description: `This invitation is for ${data.invitation.inviteeEmail}. Please log in with that account.`,
        variant: "destructive",
      });
      return;
    }

    setResponding(true);
    try {
      const res = await fetch(`/api/invitations/${data.invitation.id}/respond`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to respond");
      }

      toast({
        title: "Response recorded",
        description: `You have ${status.toLowerCase()} the invitation.`,
      });
      
      // Refresh data to show updated status
      setData({
        ...data,
        invitation: { ...data.invitation, status }
      });
      
      // Redirect to event page after a short delay
      setTimeout(() => {
        router.push(`/events/${data.event.id}`);
      }, 2000);
      
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setResponding(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Invalid Invitation</CardTitle>
          </CardHeader>
          <CardContent>
            <p>{error}</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => router.push("/")}>Go to Home</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const { event, invitation } = data;
  const isResponded = invitation.status !== "PENDING";

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>You're Invited!</CardTitle>
          <CardDescription>
            You have been invited to attend <strong>{event.title}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invitation.message && (
            <div className="bg-muted p-3 rounded-md italic text-sm border-l-4 border-primary">
              "{invitation.message}"
            </div>
          )}
          
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{format(new Date(event.startDateTime), "EEEE, MMMM d, yyyy")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                {format(new Date(event.startDateTime), "h:mm a")} - {format(new Date(event.endDateTime), "h:mm a")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>
                {event.isVirtual ? "Virtual Event" : event.location || "TBD"}
              </span>
            </div>
          </div>

          {event.description && (
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-1">About this event</h4>
              <p className="text-sm text-muted-foreground line-clamp-3">{event.description}</p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          {isResponded ? (
            <div className="w-full text-center p-3 bg-muted rounded-md space-y-2">
              <p>You have already <strong>{invitation.status.toLowerCase()}</strong> this invitation.</p>
              {invitation.status === "ACCEPTED" && (
                <Button variant="outline" size="sm" asChild>
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
              )}
              <Button variant="link" onClick={() => router.push(`/events/${event.id}`)} className="mt-2">
                View Event Details
              </Button>
            </div>
          ) : (
            <>
              {!user && (
                <div className="w-full text-sm text-center text-muted-foreground mb-2">
                  You will be asked to log in or create an account to respond.
                </div>
              )}
              <div className="flex w-full gap-3">
                <Button 
                  className="flex-1" 
                  variant="outline" 
                  onClick={() => handleRespond("DECLINED")}
                  disabled={responding}
                >
                  Decline
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={() => handleRespond("ACCEPTED")}
                  disabled={responding}
                >
                  {responding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Accept Invite
                </Button>
              </div>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
