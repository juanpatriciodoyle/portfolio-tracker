import { fireEvent, screen } from '@testing-library/react';

/** Opens a country field, types into it and picks the option with the given name. */
export async function chooseCountry(label: string, typed: string, option: string | RegExp) {
  const input = screen.getByLabelText(label);
  fireEvent.click(input);
  fireEvent.change(input, { target: { value: typed } });
  fireEvent.click(await screen.findByRole('option', { name: option }));
}

export const clickContinue = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
