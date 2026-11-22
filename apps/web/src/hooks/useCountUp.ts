import { useEffect, useRef, useState } from 'react';
import { countUpDurationMs, tweenValue } from '../lib/easing';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';

interface CountUpOptions {
  /** The figure is already known when it first appears (it comes from memory): no entrance, it only moves when it changes. */
  settled?: boolean;
}

/**
 * The figure on screen while it settles toward `target`: from 0 on arrival, from wherever it stood when the
 * target changes (a new period, the inflation toggle). With reduced motion it is simply the target.
 */
export function useCountUp(target: number, { settled = false }: CountUpOptions = {}): number {
  const reduced = prefersReducedMotion();
  const [shown, setShown] = useState(settled ? target : 0);
  const latest = useRef(settled ? target : 0);

  useEffect(() => {
    if (reduced || latest.current === target) return;
    const from = latest.current;
    const duration = countUpDurationMs(from);
    const startedAt = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const progress = (now - startedAt) / duration;
      latest.current = tweenValue(from, target, progress);
      setShown(latest.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);

  return reduced ? target : shown;
}
