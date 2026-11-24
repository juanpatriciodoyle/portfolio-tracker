import { createElement } from 'react';
import { currencyIcon } from '../lib/currencyIcon';

/** The symbol of a currency, drawn as an icon that assistive technology skips (the amount beside it says the rest). */
export default function CurrencyIcon({ currency, size }: { currency: string; size: number }) {
  return createElement(currencyIcon(currency), { size, 'aria-hidden': true });
}
