"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest } from "@/lib/api-client";
import { Search, Sparkles, Loader2, MapPin } from "lucide-react";
import { formatDateTime } from "@/utils/dates";

interface SearchResult {
  id: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  tags: string[];
  myStatus: string | null;
}

interface ParsedFilters {
  keywords: string[];
  dateFrom: string | null;
  dateTo: string | null;
  location: string | null;
  tags: string[];
  isVirtual: boolean | null;
}

interface SearchResponse {
  query: string;
  parsedFilters: ParsedFilters;
  data: SearchResult[];
  pagination: { total: number };
}

export function NlpSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await apiRequest<SearchResponse>(
        `/api/ai/search?q=${encodeURIComponent(query)}`
      );
      setResults(res);
      setShowResults(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder='Try "team lunches next week" or "virtual workshops in March"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="mr-1 h-4 w-4" />
              Smart Search
            </>
          )}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {showResults && results && (
        <Card>
          <CardContent className="pt-4">
            <div className="mb-3 flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground">Parsed:</span>
              {results.parsedFilters.keywords?.map((kw) => (
                <Badge key={kw} variant="outline" className="text-xs">{kw}</Badge>
              ))}
              {results.parsedFilters.dateFrom && (
                <Badge variant="secondary" className="text-xs">
                  from: {results.parsedFilters.dateFrom.split("T")[0]}
                </Badge>
              )}
              {results.parsedFilters.dateTo && (
                <Badge variant="secondary" className="text-xs">
                  to: {results.parsedFilters.dateTo.split("T")[0]}
                </Badge>
              )}
              {results.parsedFilters.location && (
                <Badge variant="secondary" className="text-xs">
                  near: {results.parsedFilters.location}
                </Badge>
              )}
              {results.parsedFilters.tags?.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
            </div>

            {results.data?.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No events match your search
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {results.pagination.total} result{results.pagination.total !== 1 && "s"}
                </p>
                {results.data.map((event) => (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    className="block rounded-md border p-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{event.title}</span>
                      {event.myStatus && (
                        <Badge variant="secondary" className="text-xs">
                          {event.myStatus}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{formatDateTime(event.startDateTime)}</span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setShowResults(false)}
            >
              Close results
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
