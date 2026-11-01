import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import NationalitiesInput from '../NationalitiesInput';

function Harness({ initial = [] as string[] }: { initial?: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <label htmlFor="n">Nationalities</label>
      <NationalitiesInput id="n" value={value} onChange={setValue} />
      <output data-testid="codes">{value.join(',')}</output>
    </>
  );
}

const codes = () => screen.getByTestId('codes').textContent;
const field = () => screen.getByLabelText('Nationalities');
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });

describe('NationalitiesInput', () => {
  it('turns what is typed into a pill on Enter', () => {
    render(<Harness />);

    type('Spain');
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(codes()).toBe('ES');
    expect(screen.getByRole('list', { name: 'Chosen nationalities' })).toHaveTextContent('🇪🇸 Spain');
    expect(field()).toHaveValue('');
  });

  it('turns it into a pill on a comma, in either language', () => {
    render(<Harness />);

    type('España,');
    expect(codes()).toBe('ES');
    type('Alemania,');

    expect(codes()).toBe('ES,DE');
  });

  it('turns a pasted list into several pills', () => {
    render(<Harness />);

    type('Argentina, Italy; France');

    expect(codes()).toBe('AR,IT,FR');
  });

  it('accepts the beginning of a name that only one country has', () => {
    render(<Harness />);

    type('argent');
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(codes()).toBe('AR');
  });

  it('asks for more when several countries fit, and keeps what was typed', () => {
    render(<Harness />);

    type('sou');
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent(/Did you mean/);
    expect(codes()).toBe('');
    expect(field()).toHaveValue('sou');
  });

  it('says when it does not know the country', () => {
    render(<Harness />);

    type('Narnia');
    fireEvent.keyDown(field(), { key: 'Enter' });

    expect(screen.getByRole('alert')).toHaveTextContent('We do not know a country called "Narnia".');
  });

  it('adds the good entries of a list and stops at the one it cannot read', () => {
    render(<Harness />);

    type('Spain, Narnia, Italy');

    expect(codes()).toBe('ES');
    expect(field()).toHaveValue('Narnia, Italy');
  });

  it('does not add the same country twice', () => {
    render(<Harness initial={['ES']} />);

    type('Spain,');

    expect(codes()).toBe('ES');
  });

  it('takes the last pill back with Backspace on an empty field, and any pill with its button', () => {
    render(<Harness initial={['ES', 'AR']} />);

    fireEvent.keyDown(field(), { key: 'Backspace' });
    expect(codes()).toBe('ES');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Spain' }));
    expect(codes()).toBe('');
  });

  it('keeps what was typed when the field is left', () => {
    render(<Harness />);

    type('Portugal');
    fireEvent.blur(field());

    expect(codes()).toBe('PT');
  });

  it('stops at five', () => {
    render(<Harness initial={['ES', 'AR', 'PT', 'FR', 'IT']} />);

    expect(field()).toBeDisabled();
  });
});
