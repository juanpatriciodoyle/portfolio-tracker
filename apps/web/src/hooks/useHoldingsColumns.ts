import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_COLUMNS, parseStoredColumns, serializeColumns, toggleColumn, type ColumnChoice, type ColumnKey } from '../lib/holdingsColumns';

const STORAGE_KEY = 'holdings.columns';

function readStored(): ColumnChoice {
  try {
    return parseStoredColumns(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/** Which columns the table shows. The choice is a convenience of this browser: kept when it can be, never needed. */
export function useHoldingsColumns(): { choice: ColumnChoice; toggle: (key: ColumnKey) => void } {
  const [choice, setChoice] = useState<ColumnChoice>(readStored);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeColumns(choice));
    } catch {
      /* private window or blocked storage: the choice simply lasts until the page closes */
    }
  }, [choice]);

  const toggle = useCallback((key: ColumnKey) => setChoice((current) => toggleColumn(current, key)), []);
  return { choice, toggle };
}
