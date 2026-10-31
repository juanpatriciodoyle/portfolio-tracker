import { describe, expect, it } from 'vitest';
import { makeProfile } from '../../../test/fixtures';
import { isProfileEmpty, toProfileDraft, validateProfileDraft } from '../profileDraft';

describe('profile form', () => {
  it('round-trips a profile through the draft', () => {
    const profile = makeProfile();

    const result = validateProfileDraft(toProfileDraft(profile));

    expect(result).toEqual({ ok: true, profile });
  });

  it('turns empty fields into nulls', () => {
    const result = validateProfileDraft({
      fullName: '  ',
      birthYear: '',
      nationalities: [],
      taxResidence: '',
      householdAdults: 1,
      dependentChildren: 0,
      employmentStatus: '',
    });

    expect(result).toEqual({
      ok: true,
      profile: {
        fullName: null,
        birthYear: null,
        nationalities: [],
        taxResidence: null,
        householdAdults: 1,
        dependentChildren: 0,
        employmentStatus: null,
      },
    });
  });

  it.each(['90', '19900', 'abcd', '19.9'])('rejects the birth year %p', (birthYear) => {
    const result = validateProfileDraft({ ...toProfileDraft(makeProfile()), birthYear });

    expect(result).toMatchObject({ ok: false, errors: { birthYear: 'Use a four-digit year such as 1990.' } });
  });

  it('applies the contract: no years before 1900, no duplicate nationalities, no empty household', () => {
    const draft = toProfileDraft(makeProfile());

    expect(validateProfileDraft({ ...draft, birthYear: '1850' })).toMatchObject({ ok: false, errors: { birthYear: expect.any(String) } });
    expect(validateProfileDraft({ ...draft, nationalities: ['ES', 'ES'] })).toMatchObject({
      ok: false,
      errors: { nationalities: expect.any(String) },
    });
    expect(validateProfileDraft({ ...draft, householdAdults: 0 })).toMatchObject({ ok: false, errors: { householdAdults: expect.any(String) } });
  });

  it('knows when nothing has been filled in', () => {
    expect(
      isProfileEmpty(
        makeProfile({ fullName: null, birthYear: null, nationalities: [], taxResidence: null, employmentStatus: null })
      )
    ).toBe(true);
    expect(isProfileEmpty(makeProfile())).toBe(false);
    expect(isProfileEmpty(makeProfile({ fullName: null, birthYear: null, nationalities: [], taxResidence: null, employmentStatus: 'RETIRED' }))).toBe(false);
  });
});
