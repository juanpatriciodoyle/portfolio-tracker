import { benchmarks } from './benchmarks';
import { costs } from './costs';
import { home } from './home';
import { income } from './income';
import { milestones } from './milestones';
import { profile } from './profile';
import { shell } from './shell';

/** English: the source text, and the definition of which keys exist. */
export const en = { ...benchmarks, ...costs, ...home, ...income, ...milestones, ...profile, ...shell } as const;
