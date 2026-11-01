import type { CalendarDate, SecondSalaryGap, SecondSalaryResponse } from '../contracts';
import { phaseSnapshot, phaseStatus } from '../domain/livingPhase';
import {
  CONSERVATIVE_REAL_YIELD,
  SECOND_SALARY_TARGET_MAX_MINOR,
  SECOND_SALARY_TARGET_MIN_MINOR,
  wealthMilestones,
} from '../domain/wealthMilestones';
import type { LivingPhaseService } from './livingPhaseService';
import type { PortfolioValueReader } from './ports';

export interface SecondSalaryServiceDeps {
  readonly phases: LivingPhaseService;
  readonly portfolio: PortfolioValueReader;
}

/** What the portfolio could pay each month, set against the cost of the life being lived now. A query: it changes nothing. */
export class SecondSalaryService {
  constructor(private readonly deps: SecondSalaryServiceDeps) {}

  async secondSalary(userId: string, asOf: CalendarDate): Promise<SecondSalaryResponse> {
    const [loaded, capital] = await Promise.all([this.deps.phases.loadPhases(userId), this.deps.portfolio.netWorth(userId)]);

    const current = loaded.find(({ phase }) => phaseStatus(phase, asOf) === 'current');
    const snapshot = current && phaseSnapshot(current.phase, asOf);
    const gap: SecondSalaryGap | null = !snapshot
      ? 'NO_CURRENT_PHASE'
      : snapshot.currency !== capital.currency
        ? 'CURRENCY_MISMATCH'
        : snapshot.monthlyFixedCostsMinor <= 0
          ? 'NO_COSTS'
          : null;

    const result = wealthMilestones({
      capitalMinor: capital.amountMinor,
      costsByCategoryMinor: gap === null && snapshot ? snapshot.fixedCostsByCategoryMinor : null,
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
      target: { ...result.target, minMonthlyMinor: SECOND_SALARY_TARGET_MIN_MINOR, maxMonthlyMinor: SECOND_SALARY_TARGET_MAX_MINOR },
    };
  }
}
