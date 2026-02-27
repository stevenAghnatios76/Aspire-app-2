"use client";

import { useState, useEffect, useCallback } from "react";
import { LayoutDashboard } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, ApiError } from "@/lib/api-client";
import { DashboardAnalytics } from "@/types/firestore";

import { StatCards } from "@/components/dashboard/StatCards";
import { EventsTrendChart } from "@/components/dashboard/EventsTrendChart";
import { RsvpBreakdownChart } from "@/components/dashboard/RsvpBreakdownChart";
import { AttendanceRateChart } from "@/components/dashboard/AttendanceRateChart";
import { TopTagsChart } from "@/components/dashboard/TopTagsChart";
import { WeeklySummary } from "@/components/dashboard/WeeklySummary";

type Period = "7d" | "30d" | "90d" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  all: "All time",
};

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<DashboardAnalytics>(
        `/api/dashboard/analytics?period=${p}`
      );
      setAnalytics(result);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Failed to load analytics";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics(period);
  }, [period, fetchAnalytics]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* AI Weekly Summary — always visible */}
      <WeeklySummary />

      {/* Loading state */}
      {loading && (
        <div className="space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[120px] rounded-lg border bg-card animate-pulse"
              />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2 h-[320px] rounded-lg border bg-card animate-pulse" />
            <div className="h-[320px] rounded-lg border bg-card animate-pulse" />
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">{error}</p>
          <button
            onClick={() => fetchAnalytics(period)}
            className="text-sm font-medium text-primary underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Analytics content */}
      {analytics && !loading && (
        <>
          {/* Stat cards */}
          <StatCards analytics={analytics} />

          {/* Charts row 1: Events trend + RSVP breakdown */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <EventsTrendChart data={analytics.eventsTrend} />
            </div>
            <div>
              <RsvpBreakdownChart data={analytics.rsvpBreakdown} />
            </div>
          </div>

          {/* Charts row 2: Attendance rate + Top tags */}
          <div className="grid gap-4 md:grid-cols-2">
            <AttendanceRateChart
              data={analytics.attendanceTrend}
              averageRate={analytics.attendanceRate}
            />
            <TopTagsChart data={analytics.topTags} />
          </div>
        </>
      )}
    </div>
  );
}
