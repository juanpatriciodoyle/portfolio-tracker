import { describe, expect, it } from 'vitest';
import { PHASE_NAME_MAX_LENGTH, phaseDisplayName, withDisplayNames } from '../phaseName';

describe('phaseDisplayName', () => {
  it('is the flag, the city and the address', () => {
    expect(phaseDisplayName({ countryCode: 'ES', city: 'Madrid', address: 'Calle Mayor 1' })).toBe('🇪🇸 Madrid Calle Mayor 1');
  });

  it('leaves out an address that was not given', () => {
    expect(phaseDisplayName({ countryCode: 'AR', city: 'Buenos Aires', address: null })).toBe('🇦🇷 Buenos Aires');
    expect(phaseDisplayName({ countryCode: 'AR', city: 'Buenos Aires', address: '   ' })).toBe('🇦🇷 Buenos Aires');
  });

  it('trims the pieces and collapses inner spaces', () => {
    expect(phaseDisplayName({ countryCode: 'PT', city: '  Lisbon ', address: ' Rua  Augusta ' })).toBe('🇵🇹 Lisbon Rua Augusta');
  });

  it('drops the flag when the country is not a known code', () => {
    expect(phaseDisplayName({ countryCode: '', city: 'Madrid', address: null })).toBe('Madrid');
  });

  it('stays within the length a phase name may have, ending with an ellipsis when it is cut', () => {
    const name = phaseDisplayName({ countryCode: 'ES', city: 'Madrid', address: 'x'.repeat(200) });

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

describe('withDisplayNames', () => {
  const phase = { id: 'p1', name: 'Madrid flat', countryCode: 'ES', city: 'Madrid', address: 'Calle Mayor 1' };
  const entry = { phaseId: 'p1', name: 'Madrid flat', other: 1 };

  it('renames phases and their timeline entries after where they are, whatever was stored', () => {
    const result = withDisplayNames([phase], [entry]);

    expect(result.phases[0].name).toBe('🇪🇸 Madrid Calle Mayor 1');
    expect(result.entries[0]).toEqual({ phaseId: 'p1', name: '🇪🇸 Madrid Calle Mayor 1', other: 1 });
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
