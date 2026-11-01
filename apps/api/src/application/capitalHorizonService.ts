import type { CalendarDate, CapitalHorizonResponse } from '../contracts';
import { capitalMilestonePacing } from '../domain/wealthMilestones';
import { currentLifestyle } from './currentLifestyle';
import type { LivingPhaseService } from './livingPhaseService';
import type { PortfolioValueReader } from './ports';
import type { ProfileService } from './profileService';

export interface CapitalHorizonServiceDeps {
  readonly phases: LivingPhaseService;
  readonly profiles: ProfileService;
  readonly portfolio: PortfolioValueReader;
}

/** How far each saved goal is from the portfolio, paced by what the current life leaves over each month. A query: it changes nothing. */
export class CapitalHorizonService {
  constructor(private readonly deps: CapitalHorizonServiceDeps) {}

  async capitalHorizon(userId: string, asOf: CalendarDate): Promise<CapitalHorizonResponse> {
    const [loaded, milestones, capital] = await Promise.all([
      this.deps.phases.loadPhases(userId),
      this.deps.profiles.getCapitalMilestones(userId),
      this.deps.portfolio.netWorth(userId),
    ]);

    const { gap, snapshot } = currentLifestyle(loaded, asOf, capital.currency);
    const monthlySurplusMinor = snapshot?.savingsCapacityMinor ?? null;

    return {
      asOf,
      currency: capital.currency,
      liquidPortfolioMinor: capital.amountMinor,
      monthlySurplusMinor,
      gap,
      milestones: milestones.map((milestone) => ({
        ...milestone,
        ...capitalMilestonePacing({ milestone, liquidPortfolioMinor: capital.amountMinor, monthlySurplusMinor }),
      })),
    };
  }
}
