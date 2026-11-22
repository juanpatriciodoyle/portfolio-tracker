import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { prefersReducedMotion } from '../lib/prefersReducedMotion';

interface RevealProps {
  children: ReactNode;
  className?: string;
}

/**
 * A panel that is below the fold at load arrives as it scrolls into view. One already on screen, and any
 * page without IntersectionObserver or with reduced motion, is simply there: content is visible by default.
 * The state lives in a data attribute so React never fights the stylesheet over it.
 */
export default function Reveal({ children, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    element.dataset.reveal = 'pending';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        element.dataset.reveal = 'shown';
        observer.disconnect();
      },
      { threshold: 0.1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}
