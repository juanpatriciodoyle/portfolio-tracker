import type { BillingRecordDto, LivingPhaseDto, VendorHistoryEntry } from '../../contracts';

/**
 * Every sender the person already has: the bills they logged, newest first, then the costs they gave a
 * name to in any home. It is what the first layer of the category suggestion looks through.
 */
export function vendorHistory(phases: readonly LivingPhaseDto[], records: readonly BillingRecordDto[]): VendorHistoryEntry[] {
  const billed = [...records]
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))
    .map((record): VendorHistoryEntry => ({ vendor: record.vendor, category: record.category, cadence: record.cadence }));

  const declared = phases.flatMap((phase) =>
    phase.fixedCosts.flatMap((cost): VendorHistoryEntry[] =>
      cost.label !== null && cost.label.trim() !== '' ? [{ vendor: cost.label, category: cost.category, cadence: cost.cadence }] : []
    )
  );
  return [...billed, ...declared];
}
