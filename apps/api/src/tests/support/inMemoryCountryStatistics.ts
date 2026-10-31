import type { CountryStatisticsRepository, StoredCountryStatistics } from '../../application/ports';

export class InMemoryCountryStatisticsRepository implements CountryStatisticsRepository {
  private readonly rows = new Map<string, StoredCountryStatistics>();

  async find(countryCode: string): Promise<StoredCountryStatistics | null> {
    const row = this.rows.get(countryCode);
    return row ? structuredClone(row) : null;
  }

  async save(stored: StoredCountryStatistics): Promise<void> {
    this.rows.set(stored.statistics.countryCode, structuredClone(stored));
  }
}
