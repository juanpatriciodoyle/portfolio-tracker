import type { FixedCostCategory } from '../../contracts/vocabulary';
import { fold } from './text';

const KEYWORDS: Readonly<Record<FixedCostCategory, readonly RegExp[]>> = {
  ELECTRICITY: [/\belectricidad\b/, /\belectricity\b/, /\belectrica\b/, /potencia contratada/, /\bkwh\b/, /\bkw\b/, /\bluz\b/, /\bstrom\b/, /\belectricite\b/],
  GAS: [/gas natural/, /\bgas\b/, /\bpcs\b/, /natural gas/, /\btherms?\b/, /\bgaz\b/],
  HEATING_COOLING: [/aerotermia/, /calefaccion/, /heating/, /cooling/, /district heating/, /fernwarme/, /chauffage/],
  WATER: [/\bagua\b/, /\bwater\b/, /alcantarillado/, /sewerage/, /saneamiento/, /\bm3\b/, /\bm³\b/, /\beau\b/, /\bwasser\b/],
  INTERNET: [/\binternet\b/, /\bfibra\b/, /banda ancha/, /broadband/, /\bwi-?fi\b/, /\bfiber\b/, /\bfibre\b/, /\bmbps\b/],
  PHONE: [/\bmovil\b/, /\bmobile\b/, /\broaming\b/, /\btelefonia\b/, /\bprepago\b/, /\bsms\b/],
  SUBSCRIPTIONS: [/subscription/, /suscripcion/, /membership/, /\bpremium\b/, /\brenews\b/, /\bse renueva\b/, /abonnement/],
  RENT: [/\balquiler\b/, /arrendamiento/, /arrendador/, /\brent\b/, /\blandlord\b/, /\binquilino\b/, /\bloyer\b/],
  TAXES: [/\bibi\b/, /impuesto sobre bienes/, /contribucion/, /council tax/, /property tax/, /tasa de basuras/, /tasa municipal/, /\babl\b/, /impuesto de circulacion/, /impuesto sobre vehiculos/],
  OTHER: [],
};

/**
 * What the bill is for. A sender that can bill for only one thing decides it; otherwise the words
 * in the document do, and only when one category clearly wins. Answers `null` on a tie or no evidence.
 */
export function inferCategory(text: string, allowed?: readonly FixedCostCategory[]): FixedCostCategory | null {
  if (allowed?.length === 1) return allowed[0];

  const folded = fold(text);
  const scores = (Object.keys(KEYWORDS) as FixedCostCategory[])
    .filter((category) => !allowed || allowed.includes(category))
    .map((category) => ({ category, score: KEYWORDS[category].filter((pattern) => pattern.test(folded)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  if (scores.length === 0) return null;
  return scores.length === 1 || scores[0].score > scores[1].score ? scores[0].category : null;
}
