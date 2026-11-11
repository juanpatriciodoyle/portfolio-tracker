import type { CalendarDate, SecondSalaryGap, SecondSalaryResponse } from '../contracts';
import { CONSERVATIVE_REAL_YIELD, wealthMilestones } from '../domain/wealthMilestones';
import { currentLifestyle } from './currentLifestyle';
import type { LivingPhaseService } from './livingPhaseService';
import type { ProfileService } from './profileService';
import type { PortfolioValueReader } from './ports';

export interface SecondSalaryServiceDeps {
  readonly phases: LivingPhaseService;
  readonly portfolio: PortfolioValueReader;
  readonly profiles: ProfileService;
}

/** What the portfolio could pay each month, set against the cost of the life being lived now. A query: it changes nothing. */
export class SecondSalaryService {
  constructor(private readonly deps: SecondSalaryServiceDeps) {}

  async secondSalary(userId: string, asOf: CalendarDate): Promise<SecondSalaryResponse> {
    const [loaded, capital, targetMonthlyMinor] = await Promise.all([
      this.deps.phases.loadPhases(userId),
      this.deps.portfolio.netWorth(userId),
      this.deps.profiles.getSecondSalaryTarget(userId),
    ]);

    const lifestyle = currentLifestyle(loaded, asOf, capital.currency);
    const gap: SecondSalaryGap | null = lifestyle.gap ?? (lifestyle.snapshot.monthlyFixedCostsMinor <= 0 ? 'NO_COSTS' : null);

    const result = wealthMilestones({
      capitalMinor: capital.amountMinor,
      targetMonthlyMinor,
      costsByCategoryMinor: gap === null && lifestyle.snapshot ? lifestyle.snapshot.fixedCostsByCategoryMinor : null,
    });

    return {
      asOf,
      currency: capital.currency,
      capitalMinor: capital.amountMinor,
      annualYield: CONSERVATIVE_REAL_YIELD,
      secondSalaryMinor: result.secondSalaryMinor,
      milestones: [...result.milestones],
      reachedMilestone: result.reachedMilestone,
      gap,
      target: result.target,
    };
  }
}
