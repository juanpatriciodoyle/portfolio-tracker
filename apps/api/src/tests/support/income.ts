import type { IncomeStream } from '../../domain/income';

/** One job that has always paid `amountMinor` a month, so a phase of any dates earns it every day. None for 0. */
export const salary = (amountMinor: number): IncomeStream[] =>
  amountMinor === 0 ? [] : [{ label: 'Salary', amountMinor, startDate: '2000-01-01', endDate: null }];
