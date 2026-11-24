import { demoSnapshotHistory } from '../domain/demoHistory';
import { DEMO_CURRENCY, DEMO_LEDGER, DEMO_REFERENCE_INDEX, DEMO_REFERENCE_PRICES } from '../domain/demoPortfolio';
import { demoProfile } from '../domain/demoProfile';
import { WORLD_INDEX_SYMBOL } from '../domain/portfolioSnapshots';
import { addDays, type CalendarDate } from '../contracts';
import type { BillingRecordService } from './billingRecordService';
import type { LivingPhaseService } from './livingPhaseService';
import type { GuestSeeder, PriceProvider, SnapshotRepository } from './ports';
import type { ProfileService } from './profileService';

/** Port: writes the demo portfolio (transactions, positions, closed sales) for one guest. */
export interface DemoPortfolioWriter {
  write(userId: string): Promise<void>;
}

/** The services real accounts save their profile with: the demo goes through them, so it is stored sealed like real data. */
export interface DemoProfileServices {
  readonly phases: LivingPhaseService;
  readonly profiles: ProfileService;
  readonly bills: BillingRecordService;
}

/** What the demo's illustrative value history is built from: today's prices where they can be read, and a place to put the readings. */
export interface DemoHistorySeeding {
  readonly snapshots: Pick<SnapshotRepository, 'saveMany'>;
  readonly prices: PriceProvider;
  readonly eurValue: Readonly<Record<string, number>>;
  /** How long a guest may wait for today's prices before the demo's reference prices are used instead. */
  readonly priceTimeoutMs: number;
}

export interface DemoGuestSeederDeps {
  readonly portfolio: DemoPortfolioWriter;
  /** Absent: the guest gets no value history (it would start empty, like a new real account). */
  readonly history?: DemoHistorySeeding;
  /** Null when the server has no encryption key: a profile cannot be stored then, and the guest gets the portfolio only. */
  readonly profile: DemoProfileServices | null;
  readonly today: () => CalendarDate;
}

/** Fills a new guest account with the demo's portfolio and, where it can be stored, the demo's profile. */
export class DemoGuestSeeder implements GuestSeeder {
  private readonly portfolio: DemoPortfolioWriter;
  private readonly history: DemoHistorySeeding | undefined;
  private readonly profile: DemoProfileServices | null;
  private readonly today: () => CalendarDate;

  constructor({ portfolio, history, profile, today }: DemoGuestSeederDeps) {
    this.portfolio = portfolio;
    this.history = history;
    this.profile = profile;
    this.today = today;
  }

  async seed(userId: string): Promise<void> {
    await this.portfolio.write(userId);
    if (this.history) await this.seedHistory(userId, this.history);
    if (this.profile) await this.seedProfile(userId, this.profile);
  }

  private async seedProfile(userId: string, { phases, profiles, bills }: DemoProfileServices): Promise<void> {
    const today = this.today();
    const demo = demoProfile(today);

    await profiles.saveProfile(userId, demo.profile, today);
    for (const { phase, bills: phaseBills } of demo.phases) {
      const { id: phaseId } = await phases.createPhase(userId, phase);
      for (const bill of phaseBills) await bills.createRecord(userId, { ...bill, phaseId });
    }
    await profiles.saveCapitalMilestones(userId, demo.capitalMilestones);
    await profiles.saveSecondSalaryTarget(userId, demo.secondSalaryTargetMinor);
  }

  /**
   * DEMO ONLY: an illustrative value history up to yesterday, ending at today's market prices (the demo's own reference prices where
   * the market cannot be read in time), so the chart and the period windows have something true to the demo to show. Today's own
   * reading is taken live, like any account's.
   */
  private async seedHistory(userId: string, { snapshots, prices, eurValue, priceTimeoutMs }: DemoHistorySeeding): Promise<void> {
    const quotes = await quotesWithin(prices, [...Object.keys(DEMO_REFERENCE_PRICES), WORLD_INDEX_SYMBOL], priceTimeoutMs);
    const usable = (symbol: string): number | undefined => {
      const price = quotes.get(symbol.toUpperCase());
      return price !== undefined && Number.isFinite(price) && price > 0 ? price : undefined;
    };
    const endPrices = Object.fromEntries(Object.entries(DEMO_REFERENCE_PRICES).map(([symbol, reference]) => [symbol, usable(symbol) ?? reference]));

    await snapshots.saveMany(
      userId,
      demoSnapshotHistory({
        ledger: DEMO_LEDGER,
        currency: DEMO_CURRENCY,
        eurValue,
        endDay: addDays(this.today(), -1),
        endPrices,
        indexEndPrice: usable(WORLD_INDEX_SYMBOL) ?? DEMO_REFERENCE_INDEX.endPrice,
      })
    );
  }
}

/** Today's prices, or nothing if the market fails or takes longer than `timeoutMs`: a guest signing in never waits on it. */
async function quotesWithin(prices: PriceProvider, symbols: readonly string[], timeoutMs: number): Promise<ReadonlyMap<string, number>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ReadonlyMap<string, number>>((resolve) => {
    timer = setTimeout(() => resolve(new Map()), timeoutMs);
  });
  try {
    return await Promise.race([prices.pricesFor(symbols, DEMO_CURRENCY).catch(() => new Map<string, number>()), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
