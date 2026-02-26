"use client";

import { useState, useCallback } from "react";
import { apiRequest, ApiError } from "@/lib/api-client";

interface UseAIOptions {
  onError?: (error: string) => void;
}

export function useAI<TRequest, TResponse>(
  endpoint: string,
  options?: UseAIOptions
) {
  const [data, setData] = useState<TResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (body: TRequest): Promise<TResponse | null> => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiRequest<TResponse>(endpoint, {
          method: "POST",
          body: JSON.stringify(body),
        });
        setData(result);
        return result;
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.status === 429
              ? "Rate limit exceeded. Please wait before trying again."
              : err.status === 502
              ? "AI service is temporarily unavailable. Please try again later."
              : err.message
            : "An unexpected error occurred";
        setError(message);
        options?.onError?.(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [endpoint, options]
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, execute, reset };
}
