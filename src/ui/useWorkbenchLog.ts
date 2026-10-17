import { useMemo } from 'react';
import { withCalculated } from '@/data/calculated';
import type { Log } from '@/data/types';
import { useLayoutStore } from '@/state/layoutStore';
import { selectActiveLog, useLogStore } from '@/state/logStore';

/**
 * The log every view reads: the active file's channels plus calculated channels from the layout.
 * Re-evaluated only when the file or the definitions change.
 */
export function useWorkbenchLog(): { log: Log | null; calcErrors: Record<string, string> } {
  const raw = useLogStore(selectActiveLog);
  const calculated = useLayoutStore((s) => s.calculated);
  return useMemo(() => {
    if (!raw) return { log: null, calcErrors: {} };
    const { log, errors } = withCalculated(raw, calculated);
    return { log, calcErrors: errors };
  }, [raw, calculated]);
}
