"use client";

import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAI } from "@/hooks/useAI";
import { TrendingUp, Loader2 } from "lucide-react";

interface PredictionResponse {
  predictedAttendanceMin: number;
  predictedAttendanceMax: number;
  confidenceLevel: "low" | "medium" | "high";
  capacityAdvice: string;
  similarEventsCount: number;
  factors: string[];
  recommendation: "raise_cap" | "lower_cap" | "cap_looks_good" | "set_a_cap" | "no_cap_needed";
}

interface AttendancePredictionProps {
  eventId?: string;
  title: string;
  tags: string[];
  startDateTime: string;
  endDateTime: string;
  isVirtual: boolean;
  maxAttendees?: number;
  currentInviteCount?: number;
  variant?: "card" | "inline";
}

const CONFIDENCE_COLORS = {
  low: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  high: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

const RECOMMENDATION_COLORS = {
  raise_cap: "text-yellow-600",
  lower_cap: "text-yellow-600",
  cap_looks_good: "text-green-600",
  set_a_cap: "text-blue-600",
  no_cap_needed: "text-green-600",
};

export function AttendancePrediction({
  eventId,
  title,
  tags,
  startDateTime,
  endDateTime,
  isVirtual,
  maxAttendees,
  currentInviteCount,
  variant = "card",
}: AttendancePredictionProps) {
  const { data, loading, error, execute } = useAI<
    Record<string, unknown>,
    PredictionResponse
  >("/api/ai/predict-attendance");

  useEffect(() => {
    // Only auto-execute if we have enough data
    if (title && startDateTime && endDateTime) {
      execute({
        eventId,
        title,
        tags,
        startDateTime,
        endDateTime,
        isVirtual,
        maxAttendees,
        currentInviteCount,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inline variant — simple text
  if (variant === "inline") {
    if (loading) {
      return (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" />
          Predicting attendance...
        </p>
      );
    }

    if (error || !data) return null;

    return (
      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5" />
        Expected {data.predictedAttendanceMin}–{data.predictedAttendanceMax} attendees
        {data.capacityAdvice && (
          <span className="text-xs"> · {data.capacityAdvice}</span>
        )}
      </p>
    );
  }

  // Card variant — full display
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Analyzing attendance patterns...</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Attendance Prediction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold">
            {data.predictedAttendanceMin}–{data.predictedAttendanceMax}
          </span>
          <span className="text-sm text-muted-foreground">expected attendees</span>
          <Badge
            className={`ml-auto text-xs ${CONFIDENCE_COLORS[data.confidenceLevel]}`}
          >
            {data.confidenceLevel} confidence
          </Badge>
        </div>

        <p className={`text-sm ${RECOMMENDATION_COLORS[data.recommendation]}`}>
          {data.capacityAdvice}
        </p>

        {data.factors.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.factors.map((factor, i) => (
              <Badge key={i} variant="outline" className="text-xs font-normal">
                {factor}
              </Badge>
            ))}
          </div>
        )}

        {data.similarEventsCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Based on {data.similarEventsCount} similar past event{data.similarEventsCount !== 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
