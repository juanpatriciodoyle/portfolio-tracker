import { fireEvent, screen, within } from '@testing-library/react';

/** Opens a country field, types into it and picks the option with the given name. */
export async function chooseCountry(label: string, typed: string, option: string | RegExp) {
  const input = screen.getByLabelText(label);
  fireEvent.click(input);
  fireEvent.change(input, { target: { value: typed } });
  // The country list only: the language selector on the page has options of its own.
  const list = await screen.findByRole('listbox', { name: 'Countries' });
  fireEvent.click(within(list).getByRole('option', { name: option }));
}

export const clickContinue = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
