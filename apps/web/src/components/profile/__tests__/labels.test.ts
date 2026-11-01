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

  it('offers every cadence, with the quarterly one worded as every 3 months', () => {
    expect(CADENCE_OPTIONS.map((option) => option.label)).toEqual(['Monthly', 'Every 2 months', 'Every 3 months', 'Every 6 months', 'Yearly']);
    expect(Object.values(CADENCE_LABELS)).not.toContain('Quarterly');
  });

  it('lists the categories in the order of the cost breakdown, heating / cooling with the utilities', () => {
    const order = CATEGORY_GROUPS.flatMap((group) => [...group.categories]);

    expect(order).toEqual(['RENT', 'ELECTRICITY', 'GAS', 'WATER', 'HEATING_COOLING', 'INTERNET', 'PHONE', 'SUBSCRIPTIONS', 'TAXES', 'OTHER']);
    expect(CATEGORY_LABELS.HEATING_COOLING).toBe('Heating / cooling');
  });

  it('puts every category in exactly one group, so none can go missing from the picker', () => {
    const grouped = CATEGORY_GROUPS.flatMap((group) => [...group.categories]);

    expect([...grouped].sort()).toEqual([...FIXED_COST_CATEGORIES].sort());
  });

  it('keeps electricity, gas, water and heating / cooling together as Utilities', () => {
    const utilities = CATEGORY_GROUPS.find((group) => group.label === 'Utilities');

    expect(utilities?.categories).toEqual(UTILITY_CATEGORIES);
  });
});
