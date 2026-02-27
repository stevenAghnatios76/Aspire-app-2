"use client";

import { useState, useEffect } from "react";
import { Sparkles, RefreshCw, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError } from "@/lib/api-client";
import { WeeklySummaryResponse } from "@/types/firestore";

export function WeeklySummary() {
  const [data, setData] = useState<WeeklySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<WeeklySummaryResponse>(
        "/api/ai/weekly-summary"
      );
      setData(result);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 429
            ? "Rate limit exceeded. Please wait before trying again."
            : err.status === 502
            ? "AI service is temporarily unavailable."
            : err.message
          : "Failed to load weekly summary";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <Card className="border-dashed">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
          <CardTitle className="text-sm font-medium">AI Weekly Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 bg-muted rounded animate-pulse w-full" />
          <div className="h-4 bg-muted rounded animate-pulse w-5/6" />
          <div className="h-4 bg-muted rounded animate-pulse w-4/6" />
          <div className="flex gap-2 mt-4">
            <div className="h-3 bg-muted rounded animate-pulse w-32" />
            <div className="h-3 bg-muted rounded animate-pulse w-28" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">AI Weekly Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchSummary}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 pb-2">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <CardTitle className="text-sm font-medium">AI Weekly Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Summary paragraph */}
        <p className="text-sm leading-relaxed">{data.summary}</p>

        {/* Highlights */}
        {data.highlights && data.highlights.length > 0 && (
          <ul className="space-y-1.5">
            {data.highlights.map((highlight, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Suggestion callout */}
        {data.suggestion && (
          <div className="flex items-start gap-2 rounded-md bg-accent/50 p-3 mt-2">
            <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm">{data.suggestion}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
