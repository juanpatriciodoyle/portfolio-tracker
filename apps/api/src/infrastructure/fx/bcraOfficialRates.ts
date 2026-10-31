import { z } from 'zod';
import { addDays } from '../../domain/calendarDate';
import type { CalendarDate } from '../../contracts/vocabulary';

const VARIABLE_5_URL = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/5';

const responseSchema = z.object({
  results: z.array(z.object({ detalle: z.array(z.object({ fecha: z.string(), valor: z.number().positive() })) })),
});

/**
 * The official wholesale exchange rate of the Central Bank of Argentina (BCRA statistics API v4, variable 5),
 * in pesos per US dollar. It is the official rate: a financial/MEP rate is a different thing and comes later.
 */
export class BcraOfficialRateSource {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs = 5000
  ) {}

  /** The rate of the newest day up to and including `on` (weekends and holidays have none). */
  async pesosPerDollar(on: CalendarDate): Promise<number> {
    const response = await this.fetchFn(`${VARIABLE_5_URL}?desde=${addDays(on, -10)}&hasta=${on}&limit=10`, {
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`BCRA answered HTTP ${response.status}`);

    const days = responseSchema
      .parse(await response.json())
      .results.flatMap((result) => result.detalle)
      .filter((day) => day.fecha <= on)
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (days.length === 0) throw new Error(`BCRA has no official rate up to ${on}`);
    return days[0].valor;
  }
}
