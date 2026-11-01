import { inferCadence } from '../domain/documentExtraction/cadence';
import { inferCategory } from '../domain/documentExtraction/category';
import { identifyVendor } from '../domain/documentExtraction/vendors';

describe('identifyVendor', () => {
  it('finds a known sender in the header, ignoring case, accents and legal suffixes', () => {
    expect(identifyVendor('IBERDROLA CLIENTES, S.A.U.\nFactura de electricidad')?.name).toBe('Iberdrola');
    expect(identifyVendor('Telefónica de España\nFactura')?.name).toBe('Movistar');
    expect(identifyVendor('TELEFONICA DE ESPANA')?.name).toBe('Movistar');
    expect(identifyVendor('Aguas de Barcelona (Agbar)')?.name).toBe('Aguas de Barcelona');
    expect(identifyVendor('Empresa Distribuidora Sur S.A.\nEdesur')?.name).toBe('Edesur');
    expect(identifyVendor('Netflix International B.V.')?.name).toBe('Netflix');
    expect(identifyVendor('British Gas Services Ltd')?.name).toBe('British Gas');
  });

  it('only matches whole words', () => {
    expect(identifyVendor('Preorange Holdings, Edenorte')).toBeNull();
    expect(identifyVendor('Vodafonezone')).toBeNull();
  });

  it('prefers the sender in the header over a company mentioned further down', () => {
    const text = ['Endesa Energía, S.A.U.', 'Factura de luz', ...Array(20).fill('línea'), 'Cambia a Movistar Fusión y ahorra'].join('\n');

    expect(identifyVendor(text)?.name).toBe('Endesa');
  });

  it('answers nothing when two known senders compete with no header to decide', () => {
    const text = [...Array(15).fill('línea'), 'Iberdrola', 'Endesa'].join('\n');

    expect(identifyVendor(text)).toBeNull();
  });

  it('accepts one known sender found anywhere', () => {
    const text = [...Array(15).fill('línea'), 'Emitida por Holaluz'].join('\n');

    expect(identifyVendor(text)?.name).toBe('Holaluz');
  });

  it('answers nothing for an unknown sender', () => {
    expect(identifyVendor('Cooperativa Eléctrica de Villa Rara\nFactura')).toBeNull();
  });

  it('says which categories a sender can bill for', () => {
    expect(identifyVendor('Netflix')?.categories).toEqual(['SUBSCRIPTIONS']);
    expect(identifyVendor('Endesa')?.categories).toEqual(['ELECTRICITY', 'GAS']);
    expect(identifyVendor('Canal de Isabel II')?.categories).toEqual(['WATER']);
  });
});

describe('heating and cooling bills', () => {
  it('reads an aerotermia sender as heating / cooling whatever else the bill says', () => {
    expect(identifyVendor('NESS Energy\nFactura de aerotermia')?.categories).toEqual(['HEATING_COOLING']);
    expect(inferCategory('Factura aerotermia\nCalefacción y refrigeración', ['HEATING_COOLING', 'ELECTRICITY'])).toBe('HEATING_COOLING');
    expect(inferCategory('District heating invoice. Fernwärme.')).toBe('HEATING_COOLING');
  });
});

describe('inferCategory', () => {
  it('uses the only category a sender can bill for', () => {
    expect(inferCategory('cualquier texto', ['WATER'])).toBe('WATER');
  });

  it('chooses among a sender’s categories by what the document talks about', () => {
    expect(inferCategory('Término de potencia contratada 4,6 kW consumo 245 kWh', ['ELECTRICITY', 'GAS'])).toBe('ELECTRICITY');
    expect(inferCategory('Gas natural consumo 120 m3 PCS', ['ELECTRICITY', 'GAS'])).toBe('GAS');
    expect(inferCategory('Fibra 600 Mb + línea móvil', ['INTERNET', 'PHONE'])).toBeNull();
    expect(inferCategory('Tarifa móvil 20 GB roaming', ['INTERNET', 'PHONE'])).toBe('PHONE');
  });

  it('answers nothing when the sender can bill for several things and the text does not decide', () => {
    expect(inferCategory('Factura número 123', ['ELECTRICITY', 'GAS'])).toBeNull();
  });

  it('works from keywords alone for an unknown sender', () => {
    expect(inferCategory('Factura de electricidad. Potencia contratada 3,45 kW')).toBe('ELECTRICITY');
    expect(inferCategory('Suministro de agua potable. Consumo 24 m³ alcantarillado')).toBe('WATER');
    expect(inferCategory('Alquiler mensual del inmueble. Arrendador: J. Pérez')).toBe('RENT');
    expect(inferCategory('Impuesto sobre Bienes Inmuebles IBI 2026')).toBe('TAXES');
    expect(inferCategory('Subscription renews monthly. Premium membership')).toBe('SUBSCRIPTIONS');
    expect(inferCategory('Banda ancha fibra óptica 1 Gb internet')).toBe('INTERNET');
  });

  it('answers nothing when two categories tie or none is mentioned', () => {
    expect(inferCategory('Electricity and water bill')).toBeNull();
    expect(inferCategory('Recibo número 5')).toBeNull();
    expect(inferCategory('')).toBeNull();
  });
});

describe('inferCadence', () => {
  const period = (periodStart: string, periodEnd: string) => ({ periodStart, periodEnd });

  it('reads the cadence from how long the period is', () => {
    expect(inferCadence({ ...period('2026-09-01', '2026-09-30'), text: '' })).toBe('MONTHLY');
    expect(inferCadence({ ...period('2026-02-01', '2026-02-28'), text: '' })).toBe('MONTHLY');
    expect(inferCadence({ ...period('2026-07-15', '2026-09-14'), text: '' })).toBe('BIMONTHLY');
    expect(inferCadence({ ...period('2026-07-01', '2026-09-30'), text: '' })).toBe('QUARTERLY');
    expect(inferCadence({ ...period('2026-01-01', '2026-12-31'), text: '' })).toBe('ANNUAL');
    expect(inferCadence({ ...period('2028-01-01', '2028-12-31'), text: '' })).toBe('ANNUAL');
  });

  it('answers nothing for a period of an unusual length, whatever the text says', () => {
    expect(inferCadence({ ...period('2026-09-01', '2026-09-15'), text: 'monthly' })).toBeNull();
    expect(inferCadence({ ...period('2026-09-01', '2026-10-20'), text: '' })).toBeNull();
  });

  it('falls back to a word in the text when there is no period', () => {
    expect(inferCadence({ periodStart: null, periodEnd: null, text: 'Cuota mensual' })).toBe('MONTHLY');
    expect(inferCadence({ periodStart: null, periodEnd: null, text: 'Renews monthly' })).toBe('MONTHLY');
    expect(inferCadence({ periodStart: null, periodEnd: null, text: 'Facturación bimestral' })).toBe('BIMONTHLY');
    expect(inferCadence({ periodStart: null, periodEnd: null, text: 'Recibo trimestral' })).toBe('QUARTERLY');
    expect(inferCadence({ periodStart: null, periodEnd: null, text: 'Annual plan, billed yearly' })).toBe('ANNUAL');
  });

  it('answers nothing when the words disagree or are absent', () => {
    expect(inferCadence({ periodStart: null, periodEnd: null, text: 'mensual o anual, usted elige' })).toBeNull();
    expect(inferCadence({ periodStart: null, periodEnd: null, text: 'Factura' })).toBeNull();
  });
});
