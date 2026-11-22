import { en } from './en';
import { esAR } from './es-AR';
import type { Locale } from './locale';
import type { Message } from './types';

export type MessageKey = keyof typeof en;

/** Every language's messages. English is the source of truth: it defines which keys exist. */
export const catalogs: Record<Locale, Record<MessageKey, Message>> = {
  en,
  'es-AR': esAR,
};
