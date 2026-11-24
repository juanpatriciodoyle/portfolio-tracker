import { CircleDollarSign, Coins, DollarSign, Euro, IndianRupee, PoundSterling, SwissFranc, type LucideIcon } from 'lucide-react';

const ICONS: Readonly<Record<string, LucideIcon>> = {
  EUR: Euro,
  USD: DollarSign,
  GBP: PoundSterling,
  CHF: SwissFranc,
  INR: IndianRupee,
  // Pesos have no icon of their own: the dollar-sign circle is the one drawn for money in the peso family.
  ARS: CircleDollarSign,
  MXN: CircleDollarSign,
  CLP: CircleDollarSign,
  COP: CircleDollarSign,
  UYU: CircleDollarSign,
};

/** The icon that stands for a currency; a currency without one gets coins, never the wrong symbol. */
export function currencyIcon(currency: string): LucideIcon {
  return ICONS[currency.trim().toUpperCase()] ?? Coins;
}
