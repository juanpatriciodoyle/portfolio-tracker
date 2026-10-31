import type { FixedCostCategory } from '../../contracts/vocabulary';
import { cleanLines, fold } from './text';

export interface KnownVendor {
  /** The name shown in the form. */
  readonly name: string;
  /** Other ways the sender signs its bills (accents and case do not matter). */
  readonly aliases: readonly string[];
  /** What this sender can bill for. */
  readonly categories: readonly FixedCostCategory[];
}

const E: FixedCostCategory[] = ['ELECTRICITY'];
const EG: FixedCostCategory[] = ['ELECTRICITY', 'GAS'];
const GE: FixedCostCategory[] = ['GAS', 'ELECTRICITY'];
const W: FixedCostCategory[] = ['WATER'];
const IP: FixedCostCategory[] = ['INTERNET', 'PHONE'];
const S: FixedCostCategory[] = ['SUBSCRIPTIONS'];

/** Senders worth recognising across Europe and the Americas. Adding one is a one-line change. */
export const KNOWN_VENDORS: readonly KnownVendor[] = [
  // Spain
  { name: 'Iberdrola', aliases: ['iberdrola'], categories: EG },
  { name: 'Endesa', aliases: ['endesa'], categories: EG },
  { name: 'Naturgy', aliases: ['naturgy', 'gas natural fenosa', 'union fenosa'], categories: EG },
  { name: 'Repsol', aliases: ['repsol'], categories: EG },
  { name: 'Holaluz', aliases: ['holaluz'], categories: E },
  { name: 'EDP', aliases: ['edp'], categories: EG },
  { name: 'Cepsa', aliases: ['cepsa', 'moeve'], categories: EG },
  { name: 'TotalEnergies', aliases: ['totalenergies'], categories: EG },
  { name: 'Canal de Isabel II', aliases: ['canal de isabel ii', 'canal isabel ii'], categories: W },
  { name: 'Aguas de Barcelona', aliases: ['aguas de barcelona', 'agbar', 'aigues de barcelona'], categories: W },
  { name: 'Movistar', aliases: ['movistar', 'telefonica'], categories: IP },
  { name: 'Vodafone', aliases: ['vodafone'], categories: IP },
  { name: 'Orange', aliases: ['orange'], categories: IP },
  { name: 'MásMóvil', aliases: ['masmovil', 'mas movil'], categories: IP },
  { name: 'Digi', aliases: ['digi spain', 'digi mobil'], categories: IP },
  { name: 'Yoigo', aliases: ['yoigo'], categories: IP },
  { name: 'Jazztel', aliases: ['jazztel'], categories: IP },
  { name: 'Pepephone', aliases: ['pepephone'], categories: IP },
  // Argentina
  { name: 'Edenor', aliases: ['edenor'], categories: E },
  { name: 'Edesur', aliases: ['edesur'], categories: E },
  { name: 'Metrogas', aliases: ['metrogas'], categories: ['GAS'] },
  { name: 'AySA', aliases: ['aysa', 'agua y saneamientos argentinos'], categories: W },
  { name: 'Telecentro', aliases: ['telecentro'], categories: IP },
  { name: 'Fibertel', aliases: ['fibertel'], categories: ['INTERNET'] },
  { name: 'Personal', aliases: ['telecom personal', 'personal flow'], categories: IP },
  { name: 'Claro', aliases: ['claro argentina', 'claro mexico', 'claro chile', 'claro colombia'], categories: IP },
  // Rest of Europe
  { name: 'EDF', aliases: ['edf'], categories: EG },
  { name: 'Engie', aliases: ['engie'], categories: GE },
  { name: 'E.ON', aliases: ['e.on', 'eon energie'], categories: EG },
  { name: 'Enel', aliases: ['enel'], categories: EG },
  { name: 'EDP Comercial', aliases: ['edp comercial'], categories: EG },
  { name: 'British Gas', aliases: ['british gas'], categories: GE },
  { name: 'Octopus Energy', aliases: ['octopus energy'], categories: EG },
  { name: 'Thames Water', aliases: ['thames water'], categories: W },
  { name: 'Vattenfall', aliases: ['vattenfall'], categories: EG },
  { name: 'Deutsche Telekom', aliases: ['deutsche telekom', 'telekom deutschland'], categories: IP },
  { name: 'BT', aliases: ['bt group', 'british telecom'], categories: IP },
  { name: 'Sky', aliases: ['sky uk', 'sky broadband'], categories: IP },
  { name: 'MEO', aliases: ['meo'], categories: IP },
  // Americas
  { name: 'Comcast', aliases: ['comcast', 'xfinity'], categories: ['INTERNET', 'PHONE', 'SUBSCRIPTIONS'] },
  { name: 'AT&T', aliases: ['at&t'], categories: IP },
  { name: 'Verizon', aliases: ['verizon'], categories: IP },
  { name: 'T-Mobile', aliases: ['t-mobile'], categories: ['PHONE', 'INTERNET'] },
  { name: 'Con Edison', aliases: ['con edison', 'consolidated edison'], categories: EG },
  { name: 'PG&E', aliases: ['pg&e', 'pacific gas and electric'], categories: EG },
  { name: 'Enel Chile', aliases: ['enel chile'], categories: E },
  { name: 'CFE', aliases: ['comision federal de electricidad'], categories: E },
  { name: 'Telmex', aliases: ['telmex'], categories: IP },
  { name: 'Vivo', aliases: ['telefonica brasil', 'vivo fibra'], categories: IP },
  // Subscriptions
  { name: 'Netflix', aliases: ['netflix'], categories: S },
  { name: 'Spotify', aliases: ['spotify'], categories: S },
  { name: 'Disney+', aliases: ['disney+', 'disney plus'], categories: S },
  { name: 'HBO Max', aliases: ['hbo max'], categories: S },
  { name: 'Amazon Prime', aliases: ['amazon prime'], categories: S },
  { name: 'YouTube Premium', aliases: ['youtube premium'], categories: S },
  { name: 'Apple', aliases: ['apple services', 'icloud', 'apple music', 'apple tv'], categories: S },
  { name: 'Adobe', aliases: ['adobe'], categories: S },
  { name: 'Microsoft 365', aliases: ['microsoft 365', 'office 365'], categories: S },
  { name: 'Dropbox', aliases: ['dropbox'], categories: S },
  { name: 'OpenAI', aliases: ['openai', 'chatgpt'], categories: S },
  { name: 'Google One', aliases: ['google one', 'google workspace'], categories: S },
  { name: 'Gym', aliases: ['basic-fit', 'basic fit', 'smartfit', 'smart fit', 'megatlon'], categories: S },
];

/** Where, in lines from the top, the sender normally signs the bill. */
const HEADER_LINES = 12;

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = KNOWN_VENDORS.map((vendor) => ({
  vendor,
  pattern: new RegExp(`(?<![a-z0-9])(?:${vendor.aliases.map((alias) => escape(fold(alias))).join('|')})(?![a-z0-9])`),
}));

function sendersIn(text: string): KnownVendor[] {
  const folded = fold(text);
  return PATTERNS.filter(({ pattern }) => pattern.test(folded)).map(({ vendor }) => vendor);
}

/**
 * Who sent the bill, from the dictionary of known senders. A sender named in the header wins over a
 * company mentioned further down (an advert for another operator); two senders competing for the same
 * place answer nothing.
 */
export function identifyVendor(text: string): KnownVendor | null {
  const lines = cleanLines(text);
  const inHeader = sendersIn(lines.slice(0, HEADER_LINES).join('\n'));
  if (inHeader.length > 0) return inHeader.length === 1 ? inHeader[0] : null;

  const anywhere = sendersIn(lines.join('\n'));
  return anywhere.length === 1 ? anywhere[0] : null;
}
