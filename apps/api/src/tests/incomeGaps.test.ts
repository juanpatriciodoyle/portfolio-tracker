import { incomeGaps, incomeReferenceDay, isPayingNow, jobsToCarry, lastPayDay, type IncomeLine } from '../contracts/incomeGaps';

const job = (label: string, startDate: string, endDate: string | null = null, amountMinor = 300000): IncomeLine => ({ label, amountMinor, startDate, endDate });
const phase = { startDate: '2026-01-01', endDate: null };

describe('incomeGaps', () => {
  it('has no gap while a job is paying', () => {
    expect(incomeGaps({ ...phase, streams: [job('A', '2026-01-01')] }, '2026-06-30')).toEqual([]);
  });

  it('reports the days between the last job ending and today', () => {
    expect(incomeGaps({ ...phase, streams: [job('A', '2026-01-01', '2026-03-31')] }, '2026-06-30')).toEqual([{ from: '2026-04-01', to: null }]);
  });

  it('closes the gap the day before the next job starts', () => {
    const streams = [job('A', '2026-01-01', '2026-03-31'), job('B', '2026-05-01')];
    expect(incomeGaps({ ...phase, streams }, '2026-06-30')).toEqual([{ from: '2026-04-01', to: '2026-04-30' }]);
  });

  it('is no gap while a second job keeps paying', () => {
    const streams = [job('A', '2026-01-01', '2026-03-31'), job('B', '2026-01-01')];
    expect(incomeGaps({ ...phase, streams }, '2026-06-30')).toEqual([]);
  });

  it('does not call the time before the first job a gap', () => {
    expect(incomeGaps({ ...phase, streams: [job('A', '2026-03-01')] }, '2026-06-30')).toEqual([]);
  });

  it('ignores one-time income: a deposit is not a paycheck', () => {
    const streams = [job('A', '2026-01-01', '2026-03-31'), { ...job('Benefit', '2026-04-10'), kind: 'ONE_TIME' as const }];
    expect(incomeGaps({ ...phase, streams }, '2026-06-30')).toEqual([{ from: '2026-04-01', to: null }]);
  });

  it('stops at the day the phase ended', () => {
    expect(incomeGaps({ startDate: '2026-01-01', endDate: '2026-05-31', streams: [job('A', '2026-01-01', '2026-03-31')] }, '2026-12-31')).toEqual([{ from: '2026-04-01', to: null }]);
  });

  it('is empty when nothing has been earned yet', () => {
    expect(incomeGaps({ ...phase, streams: [] }, '2026-06-30')).toEqual([]);
  });
});

describe('jobsToCarry', () => {
  const streams = [
    job('Open', '2025-01-01'),
    job('Ends later', '2025-01-01', '2026-09-30'),
    job('Ended before', '2025-01-01', '2026-05-31'),
    { ...job('Benefit', '2026-02-01'), kind: 'ONE_TIME' as const },
  ];

  it('keeps monthly jobs still paying on the day the new home starts', () => {
    expect(jobsToCarry(streams, '2026-06-01').map((s) => s.label)).toEqual(['Open', 'Ends later']);
  });

  it('leaves out a job that only starts later', () => {
    expect(jobsToCarry([job('Later', '2026-07-01')], '2026-06-01')).toEqual([]);
  });

  it('keeps a job that ends on the first day of the new home', () => {
    expect(jobsToCarry([job('Ends that day', '2025-01-01', '2026-06-01')], '2026-06-01')).toHaveLength(1);
  });
});

describe('which income stands for a home today', () => {
  const finished = { startDate: '2021-02-01', endDate: '2023-02-28' };
  const lasting = { startDate: '2023-03-01', endDate: null };

  it('counts the as-of day while the home lasts, and its last day once it is over', () => {
    expect(incomeReferenceDay(lasting, '2026-11-24')).toBe('2026-11-24');
    expect(incomeReferenceDay(finished, '2026-11-24')).toBe('2023-02-28');
    expect(incomeReferenceDay(finished, '2022-01-10')).toBe('2022-01-10');
  });

  it('holds the day at the first day of a home that has not started', () => {
    expect(incomeReferenceDay(lasting, '2023-01-01')).toBe('2023-03-01');
  });

  it('ends a job that never had an end date on the day the home ended', () => {
    expect(lastPayDay(job('Designer', '2022-07-01'), finished, '2026-11-24')).toBe('2023-02-28');
  });

  it('leaves a job in a home that lasts open-ended', () => {
    expect(lastPayDay(job('Designer', '2023-03-01'), lasting, '2026-11-24')).toBeNull();
  });

  it('keeps a job’s own end date when it is earlier than the end of the home', () => {
    expect(lastPayDay(job('Junior', '2021-02-01', '2022-06-30'), finished, '2026-11-24')).toBe('2022-06-30');
  });

  it('never lets a job outlive its home', () => {
    expect(lastPayDay(job('Odd', '2022-01-01', '2024-01-01'), finished, '2026-11-24')).toBe('2023-02-28');
  });

  it('treats a home as still lasting on its last day', () => {
    expect(lastPayDay(job('Designer', '2022-07-01'), finished, '2023-02-28')).toBeNull();
  });

  it('says a job pays now only while it has started and not yet stopped', () => {
    expect(isPayingNow(job('Designer', '2022-07-01'), finished, '2026-11-24')).toBe(false);
    expect(isPayingNow(job('Designer', '2023-03-01'), lasting, '2026-11-24')).toBe(true);
    expect(isPayingNow(job('Later', '2027-01-01'), lasting, '2026-11-24')).toBe(false);
    expect(isPayingNow({ ...job('Benefit', '2026-11-01'), kind: 'ONE_TIME' }, lasting, '2026-11-24')).toBe(false);
  });
});
