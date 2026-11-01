import { EMPLOYMENT_STATUSES, type EmploymentStatus } from '../../contracts';
import WizardField from '../wizard/WizardField';
import CountrySelect from './CountrySelect';
import { EMPLOYMENT_LABELS } from './labels';
import NationalitiesInput from './NationalitiesInput';
import type { OnboardingStepId, ProfileDraft } from './profileDraft';
import Stepper from './Stepper';

interface ProfileStepFieldsProps {
  step: OnboardingStepId;
  idPrefix: string;
  draft: ProfileDraft;
  onChange: <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => void;
  errorOf: (field: keyof ProfileDraft) => string | undefined;
  isValid: (field: keyof ProfileDraft) => boolean;
}

/** The questions of one step of "About you". */
export default function ProfileStepFields({ step, idPrefix, draft, onChange, errorOf, isValid }: ProfileStepFieldsProps) {
  const id = (field: keyof ProfileDraft) => `${idPrefix}-${field}`;
  const describedBy = (field: keyof ProfileDraft) => (errorOf(field) ? `${id(field)}-error` : undefined);

  if (step === 'about') {
    return (
      <>
        <WizardField id={id('fullName')} label="Full name" error={errorOf('fullName')} valid={isValid('fullName')}>
          <input
            id={id('fullName')}
            className="form-input"
            autoComplete="name"
            maxLength={120}
            value={draft.fullName}
            onChange={(event) => onChange('fullName', event.target.value)}
            aria-invalid={errorOf('fullName') !== undefined || undefined}
            aria-describedby={describedBy('fullName')}
          />
        </WizardField>
        <WizardField
          id={id('birthYear')}
          label="Year of birth (optional)"
          error={errorOf('birthYear')}
          valid={isValid('birthYear')}
        >
          <input
            id={id('birthYear')}
            className="form-input"
            inputMode="numeric"
            maxLength={4}
            placeholder="1990"
            value={draft.birthYear}
            onChange={(event) => onChange('birthYear', event.target.value)}
            aria-invalid={errorOf('birthYear') !== undefined || undefined}
            aria-describedby={describedBy('birthYear')}
          />
        </WizardField>
      </>
    );
  }

  if (step === 'roots') {
    return (
      <>
        <WizardField
          id={id('nationalities')}
          label="Nationalities (optional)"
          error={errorOf('nationalities')}
          valid={isValid('nationalities')}
        >
          <NationalitiesInput
            id={id('nationalities')}
            value={draft.nationalities}
            onChange={(codes) => onChange('nationalities', codes)}
            invalid={errorOf('nationalities') !== undefined}
            describedBy={describedBy('nationalities')}
          />
        </WizardField>
        <WizardField id={id('taxResidence')} label="Tax residence (optional)" valid={isValid('taxResidence')}>
          <CountrySelect
            id={id('taxResidence')}
            value={draft.taxResidence}
            onChange={(code) => onChange('taxResidence', code)}
            placeholder="Type to search, in English or Spanish"
          />
        </WizardField>
      </>
    );
  }

  return (
    <>
      <WizardField id={id('employmentStatus')} label="Work (optional)" valid={isValid('employmentStatus')}>
        <select
          id={id('employmentStatus')}
          className="form-input"
          value={draft.employmentStatus}
          onChange={(event) => onChange('employmentStatus', event.target.value as EmploymentStatus | '')}
        >
          <option value="">Prefer not to say</option>
          {EMPLOYMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {EMPLOYMENT_LABELS[status]}
            </option>
          ))}
        </select>
      </WizardField>
      <div className="wizard__row">
        <Stepper
          id={id('householdAdults')}
          label="Adults in household"
          value={draft.householdAdults}
          min={1}
          max={10}
          onChange={(value) => onChange('householdAdults', value)}
        />
        <Stepper
          id={id('dependentChildren')}
          label="Dependent children"
          value={draft.dependentChildren}
          min={0}
          max={15}
          onChange={(value) => onChange('dependentChildren', value)}
        />
      </div>
    </>
  );
}
