import { describe, expect, it } from 'vitest';
import { makePhase } from '../../../test/fixtures';
import { carriedStreams, carryCandidates, NO_CARRY_CHOICE } from '../carryOver';

const salary = { label: 'Salary', amountMinor: 320000, startDate: '2025-01-01', endDate: null };
const consulting = { label: 'Consulting', amountMinor: 50000, startDate: '2025-06-01', endDate: '2026-12-31' };
const ended = { label: 'Old job', amountMinor: 100000, startDate: '2024-01-01', endDate: '2025-12-31' };
const madrid = makePhase({ id: 'madrid', startDate: '2025-01-01', endDate: '2026-05-31', currency: 'EUR', incomeStreams: [salary, consulting, ended] });
const parse = (text: string) => (text.trim() === '' ? null : Math.round(Number(text) * 100));

describe('carryCandidates', () => {
  it('offers the jobs still paying on the first day of the new home, from the home lived in before it', () => {
    const keys = carryCandidates([madrid], '2026-06-01', 'EUR').map((candidate) => candidate.stream.label);
    expect(keys).toEqual(['Salary', 'Consulting']);
  });

  it('offers nothing for the very first home or before a start date is known', () => {
    expect(carryCandidates([madrid], '2024-01-01', 'EUR')).toEqual([]);
    expect(carryCandidates([madrid], '', 'EUR')).toEqual([]);
    expect(carryCandidates([], '2026-06-01', 'EUR')).toEqual([]);
  });

  it('takes the latest earlier home when there are several', () => {
    const older = makePhase({ id: 'older', startDate: '2020-01-01', endDate: '2024-12-31', incomeStreams: [{ ...salary, label: 'Ancient job', startDate: '2020-01-01' }] });
    expect(carryCandidates([older, madrid], '2026-06-01', 'EUR').map((candidate) => candidate.stream.label)).toEqual(['Salary', 'Consulting']);
  });

  it('marks a new home paid in another currency', () => {
    expect(carryCandidates([madrid], '2026-06-01', 'ARS').every((candidate) => !candidate.sameCurrency)).toBe(true);
  });
});

describe('carriedStreams', () => {
  const same = carryCandidates([madrid], '2026-06-01', 'EUR');

  it('copies every job, starting on the first day of the new home, and leaves the reason behind', () => {
    const result = carriedStreams(same, NO_CARRY_CHOICE, '2026-06-01', parse);
    expect(result).toEqual({
      ok: true,
      streams: [
        { ...salary, startDate: '2026-06-01' },
        { ...consulting, startDate: '2026-06-01' },
      ],
    });
  });

  it('leaves out a job that was unticked', () => {
    const result = carriedStreams(same, { unticked: [same[0].key], amounts: {} }, '2026-06-01', parse);
    expect(result.ok && result.streams.map((stream) => stream.label)).toEqual(['Consulting']);
  });

  it('never converts across currencies: the amount has to be typed again', () => {
    const other = carryCandidates([madrid], '2026-06-01', 'ARS');
    expect(carriedStreams(other, NO_CARRY_CHOICE, '2026-06-01', parse)).toMatchObject({ ok: false });

    const typed = carriedStreams(other, { unticked: [other[1].key], amounts: { [other[0].key]: '4500000' } }, '2026-06-01', parse);
    expect(typed).toEqual({ ok: true, streams: [{ ...salary, amountMinor: 450000000, startDate: '2026-06-01' }] });
  });
});
