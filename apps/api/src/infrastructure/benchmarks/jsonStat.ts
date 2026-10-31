import { z } from 'zod';

const jsonStatSchema = z.object({
  id: z.array(z.string()),
  size: z.array(z.number().int().min(0)),
  value: z.union([z.record(z.string(), z.number().nullable()), z.array(z.number().nullable())]),
  dimension: z.record(z.string(), z.object({ category: z.object({ index: z.union([z.record(z.string(), z.number().int()), z.array(z.string())]) }) })),
});

export interface JsonStatCell {
  /** The category of each dimension this value belongs to, such as { quant_inc: 'D1', geo: 'ES', time: '2025' }. */
  readonly coordinates: Readonly<Record<string, string>>;
  readonly value: number;
}

/** Reads a JSON-stat 2.0 dataset (what Eurostat answers) into plain cells. Throws when the document is not one. */
export function jsonStatCells(document: unknown): JsonStatCell[] {
  const { id, size, value, dimension } = jsonStatSchema.parse(document);
  const labels = id.map((name) => {
    const index = dimension[name].category.index;
    const byPosition: string[] = [];
    if (Array.isArray(index)) index.forEach((label, position) => (byPosition[position] = label));
    else for (const [label, position] of Object.entries(index)) byPosition[position] = label;
    return byPosition;
  });

  const entries = Array.isArray(value) ? value.map((cell, position) => [String(position), cell] as const) : Object.entries(value);
  const cells: JsonStatCell[] = [];
  for (const [flat, cell] of entries) {
    if (cell === null) continue;
    let remainder = Number(flat);
    const coordinates: Record<string, string> = {};
    for (let d = id.length - 1; d >= 0; d--) {
      coordinates[id[d]] = labels[d][remainder % size[d]];
      remainder = Math.floor(remainder / size[d]);
    }
    cells.push({ coordinates, value: cell });
  }
  return cells;
}
