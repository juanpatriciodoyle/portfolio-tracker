export interface Page<T> {
  items: T[];
  page: number;
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

/** Zero-based page of a list; an out-of-range page is clamped, an empty list is one empty page. */
export function paginate<T>(list: readonly T[], page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const current = Math.min(Math.max(0, page), pageCount - 1);
  return {
    items: list.slice(current * pageSize, (current + 1) * pageSize),
    page: current,
    pageCount,
    hasPrevious: current > 0,
    hasNext: current < pageCount - 1,
  };
}
