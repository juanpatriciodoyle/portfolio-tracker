import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SkipLink, { MAIN_CONTENT_ID } from '../SkipLink';

describe('SkipLink', () => {
  it('is the first thing a keyboard reaches, in the language of the page', () => {
    render(
      <>
        <SkipLink />
        <button type="button">Header button</button>
        <main id={MAIN_CONTENT_ID} tabIndex={-1} />
      </>,
    );

    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link.compareDocumentPosition(screen.getByRole('button'))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('moves focus to the main part of the page and leaves the address alone (pages are routed by the hash)', () => {
    window.location.hash = '#/';
    render(
      <>
        <SkipLink />
        <main id={MAIN_CONTENT_ID} tabIndex={-1} />
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }));

    expect(screen.getByRole('main')).toHaveFocus();
    expect(window.location.hash).toBe('#/');
  });
});
