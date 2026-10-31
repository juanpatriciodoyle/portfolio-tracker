import { describe, expect, it } from 'vitest';
import {
  COST_CADENCES,
  EMPLOYMENT_STATUSES,
  FIXED_COST_CATEGORIES,
  HOUSING_TENURES,
  PHASE_STATUSES,
  UTILITY_CATEGORIES,
} from '../../../contracts';
import {
  CADENCE_LABELS,
  CADENCE_OPTIONS,
  CADENCE_PHRASES,
  CATEGORY_GROUPS,
  CATEGORY_LABELS,
  EMPLOYMENT_LABELS,
  STATUS_LABELS,
  TENURE_LABELS,
} from '../labels';

describe('labels', () => {
  it('name every value of every shared vocabulary', () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...FIXED_COST_CATEGORIES].sort());
    expect(Object.keys(CADENCE_LABELS).sort()).toEqual([...COST_CADENCES].sort());
    expect(Object.keys(CADENCE_PHRASES).sort()).toEqual([...COST_CADENCES].sort());
    expect(Object.keys(TENURE_LABELS).sort()).toEqual([...HOUSING_TENURES].sort());
    expect(Object.keys(EMPLOYMENT_LABELS).sort()).toEqual([...EMPLOYMENT_STATUSES].sort());
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([...PHASE_STATUSES].sort());
  });

  it('offers every cadence, including every 2 months and quarterly', () => {
    expect(CADENCE_OPTIONS.map((option) => option.label)).toEqual(['Monthly', 'Every 2 months', 'Quarterly', 'Yearly']);
  });

  it('puts every category in exactly one group, so none can go missing from the picker', () => {
    const grouped = CATEGORY_GROUPS.flatMap((group) => [...group.categories]);

    expect([...grouped].sort()).toEqual([...FIXED_COST_CATEGORIES].sort());
  });

  it('keeps electricity, gas and water together as Utilities', () => {
    const utilities = CATEGORY_GROUPS.find((group) => group.label === 'Utilities');

    expect(utilities?.categories).toEqual(UTILITY_CATEGORIES);
  });
});
