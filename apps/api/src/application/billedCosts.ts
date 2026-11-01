import type { BilledCost } from '../domain/effectiveCosts';
import { PayloadVault } from './payloadVault';
import type { BillingRecordRepository, CipherContext, FieldCipher } from './ports';
import { billingPayloadSchema } from './storedPayloads';

export const billingRecordContext = (userId: string, recordId: string): CipherContext => ({ table: 'BillingRecord', rowId: recordId, userId });

/** Reads the bills a person received, opened and grouped by living phase, for the monthly cost maths. A query: it changes nothing. */
export class BilledCostReader {
  private readonly vault: PayloadVault;

  constructor(private readonly repository: BillingRecordRepository, cipher: FieldCipher) {
    this.vault = new PayloadVault(cipher);
  }

  async byPhase(userId: string): Promise<Map<string, BilledCost[]>> {
    const byPhase = new Map<string, BilledCost[]>();
    for (const record of await this.repository.list(userId)) {
      const { vendor, amountMinor } = this.vault.open(billingPayloadSchema, record.payload, billingRecordContext(userId, record.id));
      const bills = byPhase.get(record.phaseId) ?? [];
      bills.push({ category: record.category, cadence: record.cadence, periodStart: record.periodStart, periodEnd: record.periodEnd, amountMinor, vendor });
      byPhase.set(record.phaseId, bills);
    }
    return byPhase;
  }
}
