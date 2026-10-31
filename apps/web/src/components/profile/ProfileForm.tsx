import { Pencil, X } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { EMPLOYMENT_STATUSES, type EmploymentStatus, type ProfileData } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { countryName, flagEmoji } from '../../lib/countries';
import CountrySelect from './CountrySelect';
import { describeFailure } from './failureMessage';
import { EMPLOYMENT_LABELS } from './labels';
import {
  isProfileEmpty,
  toProfileDraft,
  validateProfileDraft,
  type ProfileDraft,
  type ProfileFieldErrors,
} from './profileDraft';
import Stepper from './Stepper';

interface ProfileFormProps {
  profile: ProfileData;
  onSave: (profile: ProfileData) => Promise<MutationResult>;
  announce: (message: string) => void;
}

const MAX_NATIONALITIES = 5;

const adults = (count: number) => `${count} ${count === 1 ? 'adult' : 'adults'}`;
const children = (count: number) => `${count} ${count === 1 ? 'child' : 'children'}`;

function Summary({ profile, onEdit }: { profile: ProfileData; onEdit: () => void }) {
  const unset = <span className="profile-facts__unset">Not set</span>;
  const household =
    profile.dependentChildren > 0
      ? `${adults(profile.householdAdults)}, ${children(profile.dependentChildren)}`
      : adults(profile.householdAdults);

  return (
    <>
      <div className="profile-section__header">
        <h2 className="profile-section__title">About you</h2>
        <button type="button" className="profile-text-button" onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" /> {isProfileEmpty(profile) ? 'Add details' : 'Edit'}
        </button>
      </div>
      {isProfileEmpty(profile) ? (
        <p className="profile-section__hint">
          Tell us a little about yourself. Age, household and work let us compare your numbers with people like you.
        </p>
      ) : (
        <dl className="profile-facts">
          <div>
            <dt>Name</dt>
            <dd>{profile.fullName ?? unset}</dd>
          </div>
          <div>
            <dt>Born</dt>
            <dd>{profile.birthYear ?? unset}</dd>
          </div>
          <div>
            <dt>Nationality</dt>
            <dd>
              {profile.nationalities.length > 0
                ? profile.nationalities.map((code) => `${flagEmoji(code)} ${countryName(code)}`).join(', ')
                : unset}
            </dd>
          </div>
          <div>
            <dt>Tax residence</dt>
            <dd>{profile.taxResidence ? `${flagEmoji(profile.taxResidence)} ${countryName(profile.taxResidence)}` : unset}</dd>
          </div>
          <div>
            <dt>Household</dt>
            <dd>{household}</dd>
          </div>
          <div>
            <dt>Work</dt>
            <dd>{profile.employmentStatus ? EMPLOYMENT_LABELS[profile.employmentStatus] : unset}</dd>
          </div>
        </dl>
      )}
    </>
  );
}

/** "About you": a calm summary that opens into an editor. Everything here is stored encrypted. */
export default function ProfileForm({ profile, onSave, announce }: ProfileFormProps) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => toProfileDraft(profile));
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));

  const startEditing = () => {
    setDraft(toProfileDraft(profile));
    setErrors({});
    setFormError(null);
    setEditing(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateProfileDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    const outcome = await onSave(result.profile);
    setSaving(false);
    if (outcome.ok) {
      setEditing(false);
      announce('Profile saved');
    } else {
      setFormError(describeFailure(outcome.failure));
    }
  };

  if (!editing) {
    return (
      <section className="profile-card" aria-label="About you">
        <Summary profile={profile} onEdit={startEditing} />
      </section>
    );
  }

  return (
    <section className="profile-card" aria-label="About you">
      <div className="profile-section__header">
        <h2 className="profile-section__title">About you</h2>
      </div>
      <form className="profile-form" onSubmit={handleSubmit} noValidate>
        <div className="profile-form__grid">
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-fullName`}>
              Full name
            </label>
            <input
              id={`${id}-fullName`}
              className="form-input"
              autoComplete="name"
              maxLength={120}
              value={draft.fullName}
              onChange={(event) => set('fullName', event.target.value)}
              aria-invalid={errors.fullName !== undefined || undefined}
            />
            {errors.fullName && (
              <p className="form-error-text" role="alert">
                {errors.fullName}
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-birthYear`}>
              Year of birth
            </label>
            <input
              id={`${id}-birthYear`}
              className="form-input"
              inputMode="numeric"
              maxLength={4}
              placeholder="1990"
              value={draft.birthYear}
              onChange={(event) => set('birthYear', event.target.value)}
              aria-invalid={errors.birthYear !== undefined || undefined}
              aria-describedby={errors.birthYear ? `${id}-birthYear-error` : undefined}
            />
            {errors.birthYear && (
              <p className="form-error-text" id={`${id}-birthYear-error`} role="alert">
                {errors.birthYear}
              </p>
            )}
          </div>

          <div className="form-group profile-form__wide">
            <label className="form-label" htmlFor={`${id}-nationality`}>
              Nationalities
            </label>
            {draft.nationalities.length > 0 && (
              <ul className="profile-tags" aria-label="Chosen nationalities">
                {draft.nationalities.map((code) => (
                  <li key={code} className="profile-tag">
                    {flagEmoji(code)} {countryName(code)}
                    <button
                      type="button"
                      className="profile-tag__remove"
                      aria-label={`Remove ${countryName(code)}`}
                      onClick={() => set('nationalities', draft.nationalities.filter((chosen) => chosen !== code))}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <CountrySelect
              id={`${id}-nationality`}
              value=""
              onChange={(code) => code && set('nationalities', [...draft.nationalities, code])}
              placeholder={draft.nationalities.length >= MAX_NATIONALITIES ? 'Up to five nationalities' : 'Add a nationality…'}
              exclude={draft.nationalities}
              disabled={draft.nationalities.length >= MAX_NATIONALITIES}
            />
            {errors.nationalities && (
              <p className="form-error-text" role="alert">
                {errors.nationalities}
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-taxResidence`}>
              Tax residence
            </label>
            <CountrySelect
              id={`${id}-taxResidence`}
              value={draft.taxResidence}
              onChange={(code) => set('taxResidence', code)}
              placeholder="Not set"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-employment`}>
              Work
            </label>
            <select
              id={`${id}-employment`}
              className="form-input"
              value={draft.employmentStatus}
              onChange={(event) => set('employmentStatus', event.target.value as EmploymentStatus | '')}
            >
              <option value="">Prefer not to say</option>
              {EMPLOYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {EMPLOYMENT_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          <Stepper
            id={`${id}-adults`}
            label="Adults in household"
            value={draft.householdAdults}
            min={1}
            max={10}
            onChange={(value) => set('householdAdults', value)}
          />
          <Stepper
            id={`${id}-children`}
            label="Dependent children"
            value={draft.dependentChildren}
            min={0}
            max={15}
            onChange={(value) => set('dependentChildren', value)}
          />
        </div>

        {formError && (
          <p className="form-error-text" role="alert">
            {formError}
          </p>
        )}

        <div className="profile-form__actions">
          <button type="submit" className="btn-primary-apply" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn-secondary-cancel" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
