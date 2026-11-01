import { describe, expect, it } from 'vitest';
import { PHASE_NAME_MAX_LENGTH, phaseAddress, phaseDisplayName, withDisplayNames } from '../phaseName';

describe('phaseDisplayName', () => {
  it('is the flag and the city, never the address', () => {
    expect(phaseDisplayName({ countryCode: 'ES', city: 'Madrid', address: 'Calle Mayor 1' })).toBe('🇪🇸 Madrid');
    expect(phaseDisplayName({ countryCode: 'AR', city: 'Buenos Aires', address: null })).toBe('🇦🇷 Buenos Aires');
  });

  it('trims the city and collapses inner spaces', () => {
    expect(phaseDisplayName({ countryCode: 'PT', city: '  Santa   Maria ', address: null })).toBe('🇵🇹 Santa Maria');
  });

  it('drops the flag when the country is not a known code', () => {
    expect(phaseDisplayName({ countryCode: '', city: 'Madrid', address: null })).toBe('Madrid');
  });

  it('stays within the length a phase name may have, ending with an ellipsis when it is cut', () => {
    const name = phaseDisplayName({ countryCode: 'ES', city: `Madrid ${'x'.repeat(200)}`, address: null });

    expect(name.length).toBeLessThanOrEqual(PHASE_NAME_MAX_LENGTH);
    expect(name.endsWith('…')).toBe(true);
    expect(name.startsWith('🇪🇸 Madrid x')).toBe(true);
  });

  it('never cuts a flag in half', () => {
    const name = phaseDisplayName({ countryCode: 'ES', city: 'c'.repeat(200), address: null });

    expect(name.startsWith('🇪🇸 c')).toBe(true);
    expect(name.length).toBeLessThanOrEqual(PHASE_NAME_MAX_LENGTH);
  });
});

describe('phaseAddress', () => {
  it('is the tidied address, or null when there is none', () => {
    expect(phaseAddress({ address: ' Calle  Mayor 1 ' })).toBe('Calle Mayor 1');
    expect(phaseAddress({ address: '   ' })).toBeNull();
    expect(phaseAddress({ address: null })).toBeNull();
  });
});

describe('withDisplayNames', () => {
  const phase = { id: 'p1', name: 'Madrid flat', countryCode: 'ES', city: 'Madrid', address: 'Calle Mayor 1' };
  const entry = { phaseId: 'p1', name: 'Madrid flat', other: 1 };

  it('renames phases and their timeline entries after where they are, whatever was stored', () => {
    const result = withDisplayNames([phase], [entry]);

    expect(result.phases[0].name).toBe('🇪🇸 Madrid');
    expect(result.entries[0]).toEqual({ phaseId: 'p1', name: '🇪🇸 Madrid', other: 1 });
  });

  it('leaves an entry alone when its phase is not in the list', () => {
    expect(withDisplayNames([phase], [{ phaseId: 'gone', name: 'Old' }]).entries[0].name).toBe('Old');
  });

  it('does not change what it was given', () => {
    withDisplayNames([phase], [entry]);

    expect(phase.name).toBe('Madrid flat');
    expect(entry.name).toBe('Madrid flat');
  });
});
