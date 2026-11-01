import { vendorNamesMatch, type CreateFixedCostRequest, type LivingPhaseDto } from '../../contracts';

/** The declared cost a fixed rate renews: same category and same name. Without a name a rate is always a new cost. */
export function findRenewedCost(phase: Pick<LivingPhaseDto, 'fixedCosts'>, input: CreateFixedCostRequest): LivingPhaseDto['fixedCosts'][number] | undefined {
  const { label } = input;
  if (!label) return undefined;
  return phase.fixedCosts.find((cost) => cost.category === input.category && cost.label !== null && vendorNamesMatch(cost.label, label));
}
