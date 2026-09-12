"use client";

import { useCallback, useEffect, useState } from "react";
import type { Paginated } from "@/types";

interface Options {
  initialPage?: number;
  pageSize?: number;
}

export function usePagedList<T>(
  fetcher: (page: number, pageSize: number) => Promise<Paginated<T>>,
  deps: unknown[],
  options: Options = {},
) {
  const { initialPage = 1, pageSize = 50 } = options;
  const [data, setData] = useState<T[]>([]);
  const [page, setPage] = useState(initialPage);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetcher(p, pageSize);
        setData(res.results || []);
        setCount(res.count || 0);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageSize, ...deps],
  );

  useEffect(() => {
    void load(page);
  }, [page, load]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return {
    data,
    count,
    page,
    totalPages,
    loading,
    error,
    reload: () => void load(page),
    goTo: setPage,
  };
}
