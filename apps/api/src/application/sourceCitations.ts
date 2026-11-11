import type { BenchmarkSource } from '../contracts/benchmark';

/** Where each income distribution comes from, so a figure on screen can be checked. */
const INCOME_CITATIONS: Readonly<Partial<Record<BenchmarkSource, { name: string; url: string }>>> = {
  EUROSTAT: { name: 'Eurostat, EU-SILC income distribution (ilc_di01) and housing costs (ilc_mded01)', url: 'https://ec.europa.eu/eurostat/databrowser/view/ilc_di01/default/table' },
  INDEC: { name: 'INDEC, Encuesta Permanente de Hogares (through datos.gob.ar)', url: 'https://datos.gob.ar' },
  WORLD_BANK: { name: 'World Bank, Poverty and Inequality Platform (2021 PPP round)', url: 'https://pip.worldbank.org' },
};

export function incomeCitation(source: BenchmarkSource, retrievedAt: string): { name: string; url: string; retrievedAt: string } {
  const known = INCOME_CITATIONS[source] ?? { name: source, url: 'https://www.worldbank.org' };
  return { ...known, retrievedAt };
}
