import { Router } from 'express';
import { z } from 'zod';
import type { MarketSearchService } from '../application/marketSearchService';
import type { ApiErrorResponse } from '../contracts';
import { parseRequest, RequestValidationError, respondWithError } from './http';

const SEARCH_UNAVAILABLE = 'Ticker search is unavailable right now. Try again in a moment, or type the symbol yourself.';

const searchQuery = z.object({ q: z.string().default('') });

/** Autocomplete for the instrument a person is logging. */
export function createMarketRouter(market: MarketSearchService): Router {
  const router = Router();

  router.get('/market/search', async (req, res) => {
    try {
      const { q } = parseRequest(searchQuery, req.query);
      res.json(await market.search(q));
    } catch (error) {
      if (error instanceof RequestValidationError) return respondWithError(error, res);
      console.error('Market search error:', error instanceof Error ? error.name : 'unknown');
      res.status(500).json({ error: SEARCH_UNAVAILABLE } satisfies ApiErrorResponse);
    }
  });

  return router;
}
