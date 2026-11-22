import { useTranslation } from '../../i18n/useTranslation';
import { ChevronDown, Pencil } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { EMPLOYMENT_STATUSES, type EmploymentStatus, type ProfileData } from '../../contracts';
import type { MutationResult } from '../../lib/apiErrors';
import { countryName, flagEmoji } from '../../lib/countries';
import CountrySelect from './CountrySelect';
import { describeFailure } from './failureMessage';
import NationalitiesInput from './NationalitiesInput';
import { EMPLOYMENT_LABELS } from './labels';
import {
  isProfileEmpty,
  toProfileDraft,
  validateProfileDraft,
  type ProfileDraft,
  type ProfileFieldErrors,
} from './profileDraft';
import Stepper from './Stepper';
import { keepDigits, keepNameCharacters } from '../../lib/inputFilters';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';

interface ProfileFormProps {
  profile: ProfileData;
  onSave: (profile: ProfileData) => Promise<MutationResult>;
  announce: (message: string) => void;
}


/** Collapsed by default: administrative setup data stays out of sight until the person asks to see or change it. */
function Summary({ profile, onEdit }: { profile: ProfileData; onEdit: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const unset = <span className="profile-facts__unset">{t('demographics.notSet')}</span>;
  const household =
    profile.dependentChildren > 0
      ? `${t('demographics.adults', { count: profile.householdAdults })}, ${t('demographics.children', { count: profile.dependentChildren })}`
      : t('demographics.adults', { count: profile.householdAdults });
  const empty = isProfileEmpty(profile);

  return (
    <>
      <div className="profile-section__header">
        <h2 className="profile-section__title">
          <button
            type="button"
            className="profile-disclosure"
            aria-expanded={open}
            aria-controls={`${id}-facts`}
            onClick={() => setOpen((current) => !current)}
          >
            <span>{t('demographics.title')}</span>
            <ChevronDown className="profile-disclosure__chevron" size={16} aria-hidden="true" />
          </button>
        </h2>
        {open && (
          <button type="button" className="profile-text-button" onClick={onEdit}>
            <Pencil size={14} aria-hidden="true" /> {empty ? t('demographics.addDetails') : t('common.edit')}
          </button>
        )}
      </div>
      <div id={`${id}-facts`} hidden={!open}>
        {empty ? (
          <p className="profile-section__hint">
            {t('demographics.hint')}
          </p>
        ) : (
          <dl className="profile-facts">
            <div>
              <dt>{t('demographics.name')}</dt>
              <dd>{profile.fullName ?? unset}</dd>
            </div>
            <div>
              <dt>{t('demographics.born')}</dt>
              <dd>{profile.birthYear ?? unset}</dd>
            </div>
            <div>
              <dt>{t('demographics.nationality')}</dt>
              <dd>
                {profile.nationalities.length > 0
                  ? profile.nationalities.map((code) => `${flagEmoji(code)} ${countryName(code)}`).join(', ')
                  : unset}
              </dd>
            </div>
            <div>
              <dt>{t('demographics.taxResidence')}</dt>
              <dd>{profile.taxResidence ? `${flagEmoji(profile.taxResidence)} ${countryName(profile.taxResidence)}` : unset}</dd>
            </div>
            <div>
              <dt>{t('demographics.household')}</dt>
              <dd>{household}</dd>
            </div>
            <div>
              <dt>{t('demographics.work')}</dt>
              <dd>{profile.employmentStatus ? t(EMPLOYMENT_LABELS[profile.employmentStatus]) : unset}</dd>
            </div>
          </dl>
        )}
      </div>
    </>
  );
}

/** "Demographics & Household Settings": a collapsed card that opens into a summary or an editor. Everything here is stored encrypted. */
export default function ProfileForm({ profile, onSave, announce }: ProfileFormProps) {
  const { t } = useTranslation();
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => toProfileDraft(profile));
  const [errors, setErrors] = useState<ProfileFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const { run, pending: saving } = useSubmitOnce();

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));

  const startEditing = () => {
    setDraft(toProfileDraft(profile));
    setErrors({});
    setFormError(null);
    setEditing(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateProfileDraft(draft, t);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFormError(null);
    await run(async () => {
      const outcome = await onSave(result.profile);
      if (outcome.ok) {
        setEditing(false);
        announce(t('profile.announce.saved'));
      } else {
        setFormError(describeFailure(outcome.failure));
      }
    });
  };

  if (!editing) {
    return (
      <section className="profile-card" aria-label={t('demographics.title')}>
        <Summary profile={profile} onEdit={startEditing} />
      </section>
    );
  }

  return (
    <section className="profile-card" aria-label={t('demographics.title')}>
      <div className="profile-section__header">
        <h2 className="profile-section__title">{t('demographics.title')}</h2>
      </div>
      <form className="profile-form" onSubmit={handleSubmit} noValidate>
        <div className="profile-form__grid">
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-fullName`}>
              {t('demographics.fullName')}
            </label>
            <input
              id={`${id}-fullName`}
              className="form-input"
              autoComplete="name"
              maxLength={120}
              value={draft.fullName}
              onChange={(event) => set('fullName', keepNameCharacters(event.target.value))}
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
              {t('demographics.birthYear')}
            </label>
            <input
              id={`${id}-birthYear`}
              className="form-input"
              inputMode="numeric"
              maxLength={4}
              placeholder="1990"
              value={draft.birthYear}
              onChange={(event) => set('birthYear', keepDigits(event.target.value, 4))}
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
              {t('demographics.nationalities')}
            </label>
            <NationalitiesInput
              id={`${id}-nationality`}
              value={draft.nationalities}
              onChange={(codes) => set('nationalities', codes)}
              invalid={errors.nationalities !== undefined}
            />
            {errors.nationalities && (
              <p className="form-error-text" role="alert">
                {errors.nationalities}
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-taxResidence`}>
              {t('demographics.taxResidence')}
            </label>
            <CountrySelect
              id={`${id}-taxResidence`}
              value={draft.taxResidence}
              onChange={(code) => set('taxResidence', code)}
              placeholder={t('demographics.notSet')}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-employment`}>
              {t('demographics.work')}
            </label>
            <select
              id={`${id}-employment`}
              className="form-input"
              value={draft.employmentStatus}
              onChange={(event) => set('employmentStatus', event.target.value as EmploymentStatus | '')}
            >
              <option value="">{t('demographics.preferNot')}</option>
              {EMPLOYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(EMPLOYMENT_LABELS[status])}
                </option>
              ))}
            </select>
          </div>

          <Stepper
            id={`${id}-adults`}
            label={t('demographics.adultsLabel')}
            value={draft.householdAdults}
            min={1}
            max={10}
            onChange={(value) => set('householdAdults', value)}
          />
          <Stepper
            id={`${id}-children`}
            label={t('demographics.childrenLabel')}
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
          <button type="submit" className="btn-primary-apply" disabled={saving} aria-busy={saving}>
            {saving ? t('demographics.saving') : t('common.save')}
          </button>
          <button type="button" className="btn-secondary-cancel" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    </section>
  );
}
