import { KNOWN_VENDORS } from '../contracts/vendorDictionary';
import { FIXED_COST_CATEGORIES } from '../contracts';
import { knownVendorsIn, nameTokens, suggestForVendor, vendorKey, vendorNamesMatch, type VendorHistoryEntry } from '../contracts/vendorMatching';

describe('vendorNamesMatch', () => {
  it('matches a short name against a longer one that starts with the same words', () => {
    expect(vendorNamesMatch('Octopus Energy', 'Octopus')).toBe(true);
    expect(vendorNamesMatch('Octopus', 'octopus energy')).toBe(true);
    expect(vendorNamesMatch('Aguas de Barcelona', 'aguas')).toBe(true);
  });

  it('matches a name that is the start of a word, ignoring case, accents and punctuation', () => {
    expect(vendorNamesMatch('NETFLIX', 'netflix')).toBe(true);
    expect(vendorNamesMatch('Telefónica', 'telefonica de españa')).toBe(true);
    expect(vendorNamesMatch('E.ON Next', 'e on')).toBe(true);
    expect(vendorNamesMatch('Iberd', 'Iberdrola')).toBe(true);
    expect(vendorNamesMatch('T-Mobile', 'tmobile')).toBe(true);
  });

  it('does not match a word found only in the middle or another sender', () => {
    expect(vendorNamesMatch('Energy', 'Octopus Energy')).toBe(false);
    expect(vendorNamesMatch('Endesa', 'Iberdrola')).toBe(false);
    expect(vendorNamesMatch('Octopus Water', 'Octopus Energy')).toBe(false);
  });

  it('matches nothing against a blank name', () => {
    expect(vendorNamesMatch('', 'Octopus')).toBe(false);
    expect(vendorNamesMatch('  ', '  ')).toBe(false);
  });
});

describe('nameTokens and vendorKey', () => {
  it('reduce a name to its words', () => {
    expect(nameTokens('  Octopus Energy, S.L. ')).toEqual(['octopus', 'energy', 's', 'l']);
    expect(vendorKey('ÁGUAS  do Porto')).toBe('aguas do porto');
    expect(vendorKey('Netflix')).toBe(vendorKey(' NETFLIX '));
  });
});

describe('suggestForVendor, layer 1: what the person already has', () => {
  const history: VendorHistoryEntry[] = [
    { vendor: 'Octopus', category: 'ELECTRICITY', cadence: 'BIMONTHLY' },
    { vendor: 'Digi', category: 'INTERNET', cadence: 'MONTHLY' },
  ];

  it('finds a sender already declared or logged, whatever the case or how much of the name was typed', () => {
    expect(suggestForVendor({ name: 'Octopus Energy', history })).toEqual({ category: 'ELECTRICITY', cadence: 'BIMONTHLY', source: 'HISTORY' });
    expect(suggestForVendor({ name: 'digi', history })).toEqual({ category: 'INTERNET', cadence: 'MONTHLY', source: 'HISTORY' });
  });

  it('beats the dictionary and the keywords: the person knows what they pay the sender for', () => {
    const own: VendorHistoryEntry[] = [{ vendor: 'Endesa Gas Service', category: 'GAS', cadence: 'QUARTERLY' }];
    expect(suggestForVendor({ name: 'Endesa Gas', history: own })).toEqual({ category: 'GAS', cadence: 'QUARTERLY', source: 'HISTORY' });
    expect(suggestForVendor({ name: 'Netflix', history: [{ vendor: 'Netflix', category: 'OTHER', cadence: null }] })?.category).toBe('OTHER');
  });

  it('takes the most common use of a sender, the earlier entry winning a tie', () => {
    const mixed: VendorHistoryEntry[] = [
      { vendor: 'Digi', category: 'PHONE', cadence: 'MONTHLY' },
      { vendor: 'Digi', category: 'INTERNET', cadence: 'MONTHLY' },
      { vendor: 'digi', category: 'INTERNET', cadence: 'MONTHLY' },
    ];
    expect(suggestForVendor({ name: 'Digi', history: mixed })?.category).toBe('INTERNET');
    expect(suggestForVendor({ name: 'Digi', history: mixed.slice(0, 2) })?.category).toBe('PHONE');
  });

  it('carries no cadence when the matching item had none', () => {
    expect(suggestForVendor({ name: 'Landlord', history: [{ vendor: 'Landlord Marta', category: 'RENT', cadence: null }] })).toEqual({
      category: 'RENT',
      cadence: null,
      source: 'HISTORY',
    });
  });
});

describe('suggestForVendor, layer 2: words that name a service in many languages', () => {
  it.each([
    ['Electricidad del Sur', 'ELECTRICITY'],
    ['Strom GmbH', 'ELECTRICITY'],
    ['Energia Verde', 'ELECTRICITY'],
    ['Luz de Madrid', 'ELECTRICITY'],
    ['Gas Natural Madrid', 'GAS'],
    ['Gaz de Bordeaux', 'GAS'],
    ['Naturgy Iberia', 'GAS'],
    ['Aguas de Valencia', 'WATER'],
    ['Acqua Milano', 'WATER'],
    ['Wasserwerke Berlin', 'WATER'],
    ['Eau de Paris', 'WATER'],
    ['Aigües de Mataró', 'WATER'],
    ['Canal de Isabel II', 'WATER'],
    ['Northern Water Board', 'WATER'],
    ['Aerotermia Hogar', 'HEATING_COOLING'],
    ['Calefacción Distrital', 'HEATING_COOLING'],
    ['District Heating Co', 'HEATING_COOLING'],
    ['Climatización Sur', 'HEATING_COOLING'],
    ['Heizung Müller', 'HEATING_COOLING'],
    ['Fibra Óptica Sur', 'INTERNET'],
    ['Fiber Net', 'INTERNET'],
    ['Wi-Fi Local', 'INTERNET'],
    ['Broadband Plus', 'INTERNET'],
    ['Telefónica', 'PHONE'],
    ['Mobile Plus', 'PHONE'],
    ['Móvil Barato', 'PHONE'],
    ['Impuesto Municipal', 'TAXES'],
    ['IBI Madrid', 'TAXES'],
    ['Tasa de basuras', 'TAXES'],
    ['Westminster Council', 'TAXES'],
    ['Steuer Amt', 'TAXES'],
    ['Netflix', 'SUBSCRIPTIONS'],
    ['Apple Music', 'SUBSCRIPTIONS'],
    ['Prime Video', 'SUBSCRIPTIONS'],
    ['Gym Club', 'SUBSCRIPTIONS'],
    ['Alquiler Piso', 'RENT'],
    ['Landlord Marta', 'RENT'],
  ])('reads %s as %s', (name, category) => {
    expect(suggestForVendor({ name })?.category).toBe(category);
  });

  it('matches short stems as whole words only', () => {
    expect(suggestForVendor({ name: 'Gasolinera Repsol' })?.category).not.toBe('GAS');
    expect(suggestForVendor({ name: 'Luzern Bank' })).toBeNull();
    expect(suggestForVendor({ name: 'Taxi Madrid' })).toBeNull();
  });

  it('gives up on a name that points two ways, leaving the next layer to try', () => {
    expect(suggestForVendor({ name: 'Gas and Electricity Co' })).toBeNull();
  });

  it('knows no cadence from words alone', () => {
    expect(suggestForVendor({ name: 'Aguas de Valencia' })?.cadence).toBeNull();
  });
});

describe('suggestForVendor, layer 3: the dictionary of senders', () => {
  it.each([
    ['NESS', 'HEATING_COOLING'],
    ['Ness', 'HEATING_COOLING'],
    ['Digi', 'INTERNET'],
    ['Endesa', 'ELECTRICITY'],
    ['Iberdrola Clientes', 'ELECTRICITY'],
    ['Repsol', 'ELECTRICITY'],
    ['Edenor', 'ELECTRICITY'],
    ['Metrogas', 'GAS'],
    ['AySA', 'WATER'],
    ['Thames', 'WATER'],
    ['Thames Water', 'WATER'],
    ['Vodafone', 'INTERNET'],
    ['T-Mobile', 'PHONE'],
    ['Comcast', 'INTERNET'],
    ['Dalkia', 'HEATING_COOLING'],
    ['Techem', 'HEATING_COOLING'],
    ['Sabesp', 'WATER'],
    ['Telmex', 'INTERNET'],
  ])('knows %s as %s', (name, category) => {
    const suggestion = suggestForVendor({ name });
    expect(suggestion?.category).toBe(category);
  });

  it('says where an answer came from, and how often the sender usually bills', () => {
    expect(suggestForVendor({ name: 'Canal de Isabel II' })).toEqual({ category: 'WATER', cadence: 'BIMONTHLY', source: 'KEYWORD' });
    expect(suggestForVendor({ name: 'Disney+' })).toEqual({ category: 'SUBSCRIPTIONS', cadence: 'MONTHLY', source: 'KEYWORD' });
    expect(suggestForVendor({ name: 'HBO Max' })?.cadence).toBe('MONTHLY');
    expect(suggestForVendor({ name: 'Endesa' })).toEqual({ category: 'ELECTRICITY', cadence: null, source: 'DICTIONARY' });
  });

  it('uses the country of the living phase to choose between senders that share a name', () => {
    const shared = knownVendorsIn('Claro');
    expect(shared.length).toBeGreaterThan(0);
    expect(suggestForVendor({ name: 'Claro', countryCode: 'AR' })?.category).toBe('PHONE');
  });

  it('reads an unknown sender by the words of its name, and answers nothing for a blank or meaningless one', () => {
    expect(suggestForVendor({ name: 'Cooperativa Eléctrica de Villa Rara' })?.category).toBe('ELECTRICITY');
    expect(suggestForVendor({ name: 'Zorblax' })).toBeNull();
    expect(suggestForVendor({ name: '   ' })).toBeNull();
  });
});

describe('the dictionary', () => {
  it('lists, for every sender, at least one alias and one category, without repeating a sender', () => {
    const names = KNOWN_VENDORS.map((vendor) => vendor.name);
    expect(new Set(names).size).toBe(names.length);
    for (const vendor of KNOWN_VENDORS) {
      expect(vendor.aliases.length).toBeGreaterThan(0);
      expect(vendor.categories.length).toBeGreaterThan(0);
      for (const category of vendor.categories) expect(FIXED_COST_CATEGORIES).toContain(category);
    }
  });

  it('covers heating and cooling, water and internet senders in Europe, Latin America, the UK and North America', () => {
    const countries = new Set(KNOWN_VENDORS.flatMap((vendor) => vendor.countries ?? []));
    for (const code of ['ES', 'PT', 'FR', 'DE', 'IT', 'PL', 'NL', 'GB', 'IE', 'US', 'CA', 'AR', 'CL', 'MX', 'CO', 'BR']) expect(countries).toContain(code);
    for (const category of ['HEATING_COOLING', 'WATER', 'INTERNET'] as const) {
      expect(KNOWN_VENDORS.filter((vendor) => vendor.categories[0] === category).length).toBeGreaterThanOrEqual(3);
    }
  });
});
