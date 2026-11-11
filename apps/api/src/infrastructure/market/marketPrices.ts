import type { PriceProvider } from '../../application/ports';
import { YahooPriceProvider } from './yahooPriceProvider';

/** One provider for the whole server, so its short-lived cache is shared by every request. */
export const marketPrices: PriceProvider = new YahooPriceProvider();

/** No prices at all: open positions are then shown at cost. */
export const noPrices: PriceProvider = { pricesFor: async () => new Map() };
