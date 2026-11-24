import { z } from 'zod';

/** Every column after the name, in the order they appear. */
export const COLUMN_KEYS = ['value', 'profit', 'share', 'units', 'held', 'paid', 'paidPerShare', 'pricePerShare', 'yearlyReturn'] as const;

export type ColumnKey = (typeof COLUMN_KEYS)[number];
export type ColumnChoice = Readonly<Record<ColumnKey, boolean>>;

/** Four columns with the name: value, profit and share of the portfolio. The rest sit under "Customize columns". */
export const DEFAULT_COLUMNS: ColumnChoice = {
  value: true,
  profit: true,
  share: true,
  units: false,
  held: false,
  paid: false,
  paidPerShare: false,
  pricePerShare: false,
  yearlyReturn: false,
};

const storedChoice = z.object(Object.fromEntries(COLUMN_KEYS.map((key) => [key, z.boolean().optional()])) as Record<ColumnKey, z.ZodOptional<z.ZodBoolean>>);

/** The names the table used before these columns: a choice saved with any of them was made for another table. */
const EARLIER_NAMES = ['position', 'netCash', 'return'];

/** What was saved, read at the edge: anything unreadable, or made for the earlier table, becomes the defaults. */
export function parseStoredColumns(raw: string | null): ColumnChoice {
  if (raw === null) return DEFAULT_COLUMNS;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return DEFAULT_COLUMNS;
  }
  if (typeof value === 'object' && value !== null && EARLIER_NAMES.some((name) => name in value)) return DEFAULT_COLUMNS;
  const parsed = storedChoice.safeParse(value);
  if (!parsed.success) return DEFAULT_COLUMNS;
  return { ...DEFAULT_COLUMNS, ...Object.fromEntries(Object.entries(parsed.data).filter(([, shown]) => shown !== undefined)) };
}

export const serializeColumns = (choice: ColumnChoice): string => JSON.stringify(choice);

export const toggleColumn = (choice: ColumnChoice, key: ColumnKey): ColumnChoice => ({ ...choice, [key]: !choice[key] });
