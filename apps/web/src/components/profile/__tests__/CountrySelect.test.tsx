import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CountrySelect from '../CountrySelect';

function renderSelect(props: Partial<React.ComponentProps<typeof CountrySelect>> = {}) {
  const onChange = vi.fn();
  render(<CountrySelect id="country" value="" onChange={onChange} placeholder="Choose a country" {...props} />);
  return { onChange, input: screen.getByRole('combobox') };
}

const optionNames = () => screen.getAllByRole('option').map((option) => option.textContent?.replace(/^\S+\s/, ''));

describe('CountrySelect', () => {
  it('stays closed until it is clicked, then lists every country', () => {
    const { input } = renderSelect();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.click(input);

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option').length).toBeGreaterThan(200);
  });

  it('filters as you type, matching the start of an English name', () => {
    const { input } = renderSelect();
    fireEvent.click(input);

    fireEvent.change(input, { target: { value: 'sp' } });

    expect(optionNames()[0]).toBe('Spain');
  });

  it('matches Spanish names too, so "es" finds España, Estonia and more', () => {
    const { input } = renderSelect();
    fireEvent.click(input);

    fireEvent.change(input, { target: { value: 'es' } });

    expect(optionNames()).toEqual(expect.arrayContaining(['Spain', 'Estonia', 'Eswatini']));
  });

  it('matches in the middle of a name, after the names that start with it', () => {
    const { input } = renderSelect();
    fireEvent.click(input);

    fireEvent.change(input, { target: { value: 'land' } });

    expect(optionNames()).toEqual(expect.arrayContaining(['Finland', 'Ireland', 'Poland']));
  });

  it('says so when nothing matches', () => {
    const { input } = renderSelect();
    fireEvent.click(input);

    fireEvent.change(input, { target: { value: 'zzzz' } });

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText(/No country matches/)).toBeInTheDocument();
  });

  it('picks with the mouse', () => {
    const { input, onChange } = renderSelect();
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'portu' } });

    fireEvent.click(screen.getByRole('option', { name: /Portugal/ }));

    expect(onChange).toHaveBeenCalledWith('PT');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('picks with the keyboard: arrows move, Enter chooses', () => {
    const { input, onChange } = renderSelect();
    fireEvent.change(input, { target: { value: 'por' } });
    const first = screen.getAllByRole('option')[0];
    expect(input).toHaveAttribute('aria-activedescendant', first.id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1].id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('PT');
  });

  it('opens with the arrow keys', () => {
    const { input } = renderSelect();

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('closes on Escape without choosing, and without letting a dialog around it close', () => {
    const outer = vi.fn();
    const { onChange, input } = renderSelect();
    document.addEventListener('keydown', outer);
    fireEvent.click(input);

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    document.removeEventListener('keydown', outer);
  });

  it('takes the best match when tabbing away from something typed', () => {
    const { input, onChange } = renderSelect();
    fireEvent.change(input, { target: { value: 'argen' } });

    fireEvent.keyDown(input, { key: 'Tab' });

    expect(onChange).toHaveBeenCalledWith('AR');
  });

  it('shows the chosen country with its flag, and puts it back after an abandoned search', () => {
    const { input } = renderSelect({ value: 'ES' });
    expect(input).toHaveValue('🇪🇸 Spain');

    fireEvent.change(input, { target: { value: 'xx' } });
    fireEvent.blur(input);

    expect(input).toHaveValue('🇪🇸 Spain');
  });

  it('clears the choice when the field is emptied and left', () => {
    const { input, onChange } = renderSelect({ value: 'ES' });

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('leaves out the countries it is told to exclude', () => {
    const { input } = renderSelect({ exclude: ['ES'] });
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: 'spain' } });

    expect(screen.queryByRole('option', { name: /Spain/ })).not.toBeInTheDocument();
  });

  it('keeps the chevron clear of the text: the field reserves room for it', () => {
    const { input } = renderSelect();

    expect(input).toHaveClass('combobox__input');
  });
});
