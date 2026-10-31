import { describe, expect, it } from 'vitest';
import { makePhase } from '../../../test/fixtures';
import { describeFailure, issuesByField } from '../failureMessage';

describe('describeFailure', () => {
  const phases = [
    makePhase({ id: 'a', name: 'Madrid', startDate: '2022-09-01', endDate: null }),
    makePhase({ id: 'b', name: 'Lisbon', startDate: '2020-01-01', endDate: '2022-08-31' }),
  ];

  it('names the phases an overlap collides with', () => {
    const message = describeFailure({ kind: 'overlap', message: 'Phases overlap', conflictingPhaseIds: ['a', 'b'] }, phases);

    expect(message).toContain('Madrid (Sep 2022 – now)');
    expect(message).toContain('Lisbon (Jan 2020 – Aug 2022)');
    expect(message).toContain('overlap');
  });

  it('still explains an overlap when the phase is not in the list', () => {
    const message = describeFailure({ kind: 'overlap', message: 'Phases overlap', conflictingPhaseIds: ['zzz'] }, phases);

    expect(message).toBe('These dates overlap another living phase. Adjust the dates so the phases do not overlap.');
  });

  it('joins the server-side validation messages', () => {
    const message = describeFailure({
      kind: 'validation',
      message: 'Invalid request',
      issues: [
        { path: 'endDate', message: 'End date cannot be before the start date' },
        { path: 'name', message: 'Too long' },
      ],
    });

    expect(message).toBe('End date cannot be before the start date Too long');
  });

  it('passes other messages through, and softens a missing item', () => {
    expect(describeFailure({ kind: 'network', message: 'Offline' })).toBe('Offline');
    expect(describeFailure({ kind: 'not-found', message: 'x' })).toContain('no longer exists');
  });
});

describe('issuesByField', () => {
  it('keys the first message of each field by the field it belongs to', () => {
    const byField = issuesByField({
      kind: 'validation',
      message: 'Invalid request',
      issues: [
        { path: 'endDate', message: 'First' },
        { path: 'endDate', message: 'Second' },
        { path: 'fixedCosts.0.amountMinor', message: 'Nested' },
      ],
    });

    expect(byField).toEqual({ endDate: 'First', fixedCosts: 'Nested' });
  });

  it('is empty for anything that is not a validation failure', () => {
    expect(issuesByField({ kind: 'network', message: 'Offline' })).toEqual({});
  });
});
