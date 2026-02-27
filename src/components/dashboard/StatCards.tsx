"use client";

import {
  CalendarPlus,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Tag,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DashboardAnalytics } from "@/types/firestore";

interface StatCardsProps {
  analytics: DashboardAnalytics;
}

export function StatCards({ analytics }: StatCardsProps) {
  const {
    eventsCreated,
    eventsCreatedDelta,
    rsvpBreakdown,
    attendanceRate,
    attendanceRateDelta,
    topTags,
    upcomingCount,
  } = analytics;

  const topTag = topTags.length > 0 ? topTags[0] : null;

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      {/* Events Created */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Events Created</CardTitle>
          <CalendarPlus className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{eventsCreated}</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {eventsCreatedDelta !== 0 && (
              <>
                {eventsCreatedDelta > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={
                    eventsCreatedDelta > 0 ? "text-green-500" : "text-red-500"
                  }
                >
                  {eventsCreatedDelta > 0 ? "+" : ""}
                  {eventsCreatedDelta}%
                </span>
              </>
            )}
            <span>vs prior period</span>
          </div>
        </CardContent>
      </Card>

      {/* RSVP Breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">RSVPs</CardTitle>
          <UserCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {rsvpBreakdown.attending + rsvpBreakdown.maybe + rsvpBreakdown.declined + rsvpBreakdown.upcoming}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <Badge variant="secondary" className="text-xs">
              ✓ {rsvpBreakdown.attending}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              ? {rsvpBreakdown.maybe}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              ✗ {rsvpBreakdown.declined}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Rate */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Attendance Rate</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{attendanceRate}%</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {attendanceRateDelta !== 0 && (
              <>
                {attendanceRateDelta > 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span
                  className={
                    attendanceRateDelta > 0 ? "text-green-500" : "text-red-500"
                  }
                >
                  {attendanceRateDelta > 0 ? "+" : ""}
                  {attendanceRateDelta}pp
                </span>
              </>
            )}
            <span>vs prior period</span>
          </div>
        </CardContent>
      </Card>

      {/* Top Tag / Upcoming */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Top Interest</CardTitle>
          <Tag className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {topTag ? (
            <>
              <div className="text-2xl font-bold truncate">{topTag.name}</div>
              <p className="text-xs text-muted-foreground">
                {topTag.count} events · {upcomingCount} upcoming
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold">{upcomingCount}</div>
              <p className="text-xs text-muted-foreground">upcoming events</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
