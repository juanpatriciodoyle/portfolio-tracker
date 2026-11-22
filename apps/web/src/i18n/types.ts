/** A message with a singular and a plural form, chosen by the `count` it is given. */
export interface PluralMessage {
  readonly one: string;
  readonly other: string;
}

export type Message = string | PluralMessage;

/** The values a message can hold in its {placeholders}. */
export type Params = Readonly<Record<string, string | number>>;

/**
 * What another language must provide for an English catalog: every key, as plain text where English
 * is plain text and as a singular/plural pair where English is. A missing or extra key fails tsc.
 */
export type Translated<T extends Record<string, Message>> = { [K in keyof T]: T[K] extends string ? string : PluralMessage };
