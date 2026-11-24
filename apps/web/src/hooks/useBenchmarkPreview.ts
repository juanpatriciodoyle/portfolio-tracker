import { useEffect, useState } from 'react';
import { benchmarkPreviewResponse, type BenchmarkPreviewQuery, type BenchmarkPreviewResponse } from '../contracts';
import { apiRequest } from '../lib/apiClient';

/** How long the person must stop typing before the server is asked. */
const TYPING_PAUSE_MS = 400;

type PreviewQuery = Pick<BenchmarkPreviewQuery, 'countryCode' | 'currency'> & Partial<Pick<BenchmarkPreviewQuery, 'monthlyIncomeMinor' | 'monthlyRentMinor'>>;

const pathOf = ({ countryCode, currency, monthlyIncomeMinor, monthlyRentMinor }: PreviewQuery) => {
  const params = new URLSearchParams({ countryCode, currency });
  if (monthlyIncomeMinor !== undefined) params.set('monthlyIncomeMinor', String(monthlyIncomeMinor));
  if (monthlyRentMinor !== undefined) params.set('monthlyRentMinor', String(monthlyRentMinor));
  return `/api/insights/benchmarks/preview?${params.toString()}`;
};

/**
 * What the public statistics already say about the country (and the income and rent typed so far), while a person is
 * still answering the first questions. A nicety: when the server cannot answer, it is silent. Null with no country.
 */
export function useBenchmarkPreview(query: PreviewQuery | null): BenchmarkPreviewResponse | null {
  const [answer, setAnswer] = useState<BenchmarkPreviewResponse | null>(null);
  const path = query ? pathOf(query) : null;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void apiRequest(path, benchmarkPreviewResponse)
        .then((preview) => {
          if (!cancelled) setAnswer(preview);
        })
        .catch(() => undefined);
    }, TYPING_PAUSE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path]);

  // The last answer stays while the next one is on its way, but only for the same country: another country's figures are never shown.
  return query !== null && answer?.countryCode === query.countryCode ? answer : null;
}
