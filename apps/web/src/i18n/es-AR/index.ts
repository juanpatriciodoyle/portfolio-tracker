import type { en } from '../en';
import type { Translated } from '../types';
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

/** Argentine Spanish (voseo). Typed against English: a missing or extra key fails tsc. */
export const esAR: Translated<typeof en> = { ...benchmarks, ...costs, ...holdings, ...home, ...income, ...insights, ...milestones, ...profile, ...shell, ...transactions };
