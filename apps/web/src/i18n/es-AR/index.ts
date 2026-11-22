import type { en } from '../en';
import type { Translated } from '../types';
import { benchmarks } from './benchmarks';
import { costs } from './costs';
import { home } from './home';
import { income } from './income';
import { milestones } from './milestones';
import { profile } from './profile';
import { shell } from './shell';

/** Argentine Spanish (voseo). Typed against English: a missing or extra key fails tsc. */
export const esAR: Translated<typeof en> = { ...benchmarks, ...costs, ...home, ...income, ...milestones, ...profile, ...shell };
