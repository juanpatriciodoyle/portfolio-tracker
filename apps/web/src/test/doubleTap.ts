import { act, fireEvent } from '@testing-library/react';

/**
 * Two taps that land before React has re-rendered. `fireEvent` alone flushes between events, so the first
 * tap would already have disabled the button and the test would pass without any guard; inside one `act`
 * the second event sees exactly what a fast second tap sees.
 */
export function tapTwice(target: Element): void {
  act(() => {
    fireEvent.click(target);
    fireEvent.click(target);
  });
}

/** Submitting a form twice, as a tap and Enter would, which a disabled button does not stop. */
export function submitTwice(form: Element | null): void {
  if (form === null) throw new Error('No form to submit.');
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
}

/** Something to answer a request with once the test says so, so a save stays in flight while the second tap lands. */
export function pendingRequest<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}
