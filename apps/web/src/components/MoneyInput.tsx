import type { InputHTMLAttributes } from 'react';
import { intlLocale } from '../i18n/locale';
import { useTranslation } from '../i18n/useTranslation';
import { currencySign } from '../lib/money';

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className' | 'style'> {
  /** The currency the amount is written in: its sign stands before the number. */
  currency: string;
}

/** A number field for an amount of money, with the sign of its currency in front so nobody has to wonder what it is in. */
export default function MoneyInput({ currency, ...input }: MoneyInputProps) {
  const { locale } = useTranslation();
  return (
    <div className="money-field">
      <span className="money-field__sign" aria-hidden="true">
        {currencySign(currency, intlLocale(locale))}
      </span>
      <input {...input} type="number" step="any" className="money-field__input" />
    </div>
  );
}
