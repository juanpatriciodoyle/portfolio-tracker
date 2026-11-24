import { benchmarks } from './benchmarks';
import { costs } from './costs';
import { holdings } from './holdings';
import { home } from './home';
import { income } from './income';
import { insights } from './insights';
import { milestones } from './milestones';
import { profile } from './profile';
import { shell } from './shell';
import { transactions } from './transactions';

/** English: the source text, and the definition of which keys exist. */
export const en = { ...benchmarks, ...costs, ...holdings, ...home, ...income, ...insights, ...milestones, ...profile, ...shell, ...transactions } as const;
