"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sparkles, MapPin, Monitor } from "lucide-react";
import { formatDateTime } from "@/utils/dates";

interface Recommendation {
  eventId: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  isVirtual: boolean;
  tags: string[];
  relevanceScore: number;
  reason: string;
}

interface RecommendationsResponse {
  recommendations: Recommendation[];
  personaInsight: string;
}

export function EventRecommendations() {
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchRecommendations() {
      try {
        const result = await apiRequest<RecommendationsResponse>(
          "/api/ai/recommendations"
        );
        if (!cancelled) setData(result);
      } catch {
        // Silently fail — recommendations are non-critical
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRecommendations();
    return () => {
      cancelled = true;
    };
  }, []);

  // Don't render anything if no data or no recommendations
  if (!loading && (!data || !data.recommendations || data.recommendations.length === 0)) {
    return null;
  }

  return (
    <div className="space-y-2">
      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="min-w-[240px] animate-pulse shrink-0">
              <CardContent className="h-28 pt-4" />
            </Card>
          ))}
        </div>
      ) : (
        data && (
          <>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Events For You</span>
              {data.personaInsight && (
                <Badge variant="outline" className="text-xs font-normal">
                  {data.personaInsight}
                </Badge>
              )}
            </div>

            <TooltipProvider>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {data.recommendations.map((rec) => (
                  <Link
                    key={rec.eventId}
                    href={`/events/${rec.eventId}`}
                    className="shrink-0"
                  >
                    <Card className="min-w-[240px] max-w-[280px] transition-colors hover:bg-muted/50">
                      <CardContent className="pt-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium line-clamp-2 leading-tight">
                            {rec.title}
                          </h4>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="secondary"
                                className="shrink-0 text-xs"
                              >
                                {Math.round((rec.relevanceScore ?? 0) * 100)}%
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px]">
                              <p className="text-xs">{rec.reason}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(rec.startDateTime)}
                        </p>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {rec.isVirtual ? (
                            <span className="flex items-center gap-1">
                              <Monitor className="h-3 w-3" />
                              Virtual
                            </span>
                          ) : rec.location ? (
                            <span className="flex items-center gap-1 truncate">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {rec.location}
                            </span>
                          ) : null}
                        </div>

                        {rec.tags?.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {rec.tags.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-[10px] px-1.5 py-0"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </TooltipProvider>
          </>
        )
      )}
    </div>
  );
}
