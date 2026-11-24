import { useMemo, useRef, useState } from 'react';
import type { ProfileData } from '../../contracts';
import { useBenchmarkPreview } from '../../hooks/useBenchmarkPreview';
import { useStepDraft } from '../../hooks/useStepDraft';
import { useSubmitOnce } from '../../hooks/useSubmitOnce';
import { intlLocale } from '../../i18n/locale';
import { useTranslation } from '../../i18n/useTranslation';
import type { MutationResult } from '../../lib/apiErrors';
import { countryName } from '../../lib/countries';
import { currencyOptions } from '../../lib/currencies';
import { clampDateYear, keepDecimal, keepNameCharacters } from '../../lib/inputFilters';
import { parseMajorToMinor } from '../../lib/money';
import WizardField from '../wizard/WizardField';
import WizardModal from '../wizard/WizardModal';
import CountrySelect from './CountrySelect';
import { describeFailure } from './failureMessage';
import {
  ONBOARDING_STEPS,
  buildOnboarding,
  chooseCountry,
  initialAnswers,
  onboardingDraftSchema,
  onboardingStepErrors,
  type OnboardingAnswers,
  type OnboardingStepId,
} from './onboardingFlow';
import { knownAboutCountry, knownAboutIncome, knownAboutRent, type Known } from './onboardingKnowledge';
import type { PhasePayload } from './phaseForm';

interface OnboardingWizardProps {
  profile: ProfileData;
  /** What the account already greets the person with: it becomes the profile's name, so nobody is asked for it twice. */
  accountName: string | null;
  defaultCurrency: string;
  /** Today as a calendar day, from the server's clock. */
  today: string;
  onSaveProfile: (profile: ProfileData) => Promise<MutationResult>;
  onCreatePhase: (payload: PhasePayload) => Promise<MutationResult<unknown>>;
  /** Everything was saved. */
  onFinished: () => void;
  /** Closed without finishing; the answers are kept for next time. */
  onClose: () => void;
}

const hasText = (value: string) => value.trim() !== '';

/** A positive amount typed in the currency, or undefined when nothing usable was typed. */
function amountOf(text: string, currency: string): number | undefined {
  if (!hasText(text)) return undefined;
  const minor = parseMajorToMinor(text, currency);
  return minor !== null && minor > 0 ? minor : undefined;
}

/** What is already known, as one quiet line under the answer, with its source beside it. */
function KnownLine({ known }: { known: Known | null }) {
  if (!known) return null;
  return (
    <p className="wizard-known" role="status">
      <span>{known.text}</span>
      {known.source && <span className="wizard-known__source">{known.source}</span>}
    </p>
  );
}

/**
 * "Tell us about yourself": three questions (where, what comes in, what the rent is) that make the home lived in today.
 * Each answer is met with what the public statistics already say. Everything else is asked later, from the Demographics card.
 */
export default function OnboardingWizard({ profile, accountName, defaultCurrency, today, onSaveProfile, onCreatePhase, onFinished, onClose }: OnboardingWizardProps) {
  const { t, locale } = useTranslation();
  const words = useTranslation();
  const currencies = useMemo(() => currencyOptions(intlLocale(locale)), [locale]);
  const steps = ONBOARDING_STEPS.map((id) => ({ id, label: t(`onboarding.${id}.label`) }));

  const { values, setValues, step, setStep, resumedAtStep, discard } = useStepDraft(
    'onboarding',
    onboardingDraftSchema,
    () => ({ answers: initialAnswers(defaultCurrency) }),
    ONBOARDING_STEPS.length
  );
  const { answers } = values;
  const stepId: OnboardingStepId = ONBOARDING_STEPS[step];
  const [tried, setTried] = useState<ReadonlySet<OnboardingStepId>>(new Set());
  const { run, pending: saving } = useSubmitOnce();
  const [formError, setFormError] = useState<string | null>(null);
  /** The day of moving in is only shown on request, or when a saved draft already holds one. */
  const [earlier, setEarlier] = useState(answers.movedIn !== '');
  /** The profile is saved before the home, and only once, even if the home has to be retried. */
  const profileSaved = useRef(false);

  const change = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => {
    setValues((previous) => ({ answers: { ...previous.answers, [key]: value } }));
    setFormError(null);
  };
  const pickCountry = (code: string) => {
    setValues((previous) => ({ answers: chooseCountry(previous.answers, code) }));
    setFormError(null);
  };

  const errors = onboardingStepErrors(answers, stepId, today, words.t);
  /** An empty answer stays quiet until its step has been tried; one that cannot be right is flagged at once. */
  const errorOf = (field: keyof OnboardingAnswers): string | undefined => {
    const value = answers[field];
    return errors[field] !== undefined && (tried.has(stepId) || (typeof value === 'string' && hasText(value))) ? errors[field] : undefined;
  };

  // What the public statistics say about the answers so far: only what has been typed is asked about.
  const incomeMinor = amountOf(answers.monthlyIncome, answers.currency);
  const rentMinor = answers.paysNoRent ? undefined : amountOf(answers.rent, answers.currency);
  const preview = useBenchmarkPreview(
    answers.countryCode === ''
      ? null
      : {
          countryCode: answers.countryCode,
          currency: answers.currency,
          ...(stepId !== 'place' && incomeMinor !== undefined ? { monthlyIncomeMinor: incomeMinor } : {}),
          ...(stepId === 'rent' && rentMinor !== undefined ? { monthlyRentMinor: rentMinor } : {}),
        }
  );
  const country = answers.countryCode === '' ? '' : countryName(answers.countryCode, intlLocale(locale));
  const known: Known | null =
    stepId === 'place'
      ? knownAboutCountry(preview, country, intlLocale(locale), t)
      : stepId === 'income'
        ? incomeMinor === undefined
          ? null
          : knownAboutIncome(preview, country, intlLocale(locale), t)
        : rentMinor === undefined
          ? null
          : knownAboutRent(preview, country, intlLocale(locale), t, incomeMinor === undefined ? undefined : rentMinor / incomeMinor);

  const finish = async () => {
    const result = buildOnboarding(answers, today, { profile, accountName }, t);
    if (!result.ok) {
      // The first step with something wrong is the one to go back to.
      const failing = ONBOARDING_STEPS.find((candidate) => Object.keys(onboardingStepErrors(answers, candidate, today, t)).length > 0);
      setTried((previous) => new Set(previous).add(failing ?? stepId));
      if (failing) setStep(ONBOARDING_STEPS.indexOf(failing));
      return;
    }

    // `run` answers undefined when a save is already on its way: that one finishes the flow.
    const saved = await run(async () => {
      setFormError(null);
      if (result.profile && !profileSaved.current) {
        const profileResult = await onSaveProfile(result.profile);
        if (!profileResult.ok) {
          setFormError(describeFailure(profileResult.failure, [], words));
          return false;
        }
        profileSaved.current = true;
      }
      const created = await onCreatePhase(result.phase);
      if (!created.ok) {
        setFormError(describeFailure(created.failure, [], words));
        return false;
      }
      return true;
    });
    if (!saved) return;
    discard();
    onFinished();
  };

  const next = () => {
    setTried((previous) => new Set(previous).add(stepId));
    if (Object.keys(errors).length > 0) return;
    if (step < ONBOARDING_STEPS.length - 1) setStep(step + 1);
    else void finish();
  };

  const id = (field: keyof OnboardingAnswers) => `onboarding-${field}`;
  const describedBy = (field: keyof OnboardingAnswers) => (errorOf(field) ? `${id(field)}-error` : undefined);

  return (
    <WizardModal
      title={t('profile.tellUs')}
      steps={steps}
      stepIndex={step}
      heading={t(`onboarding.${stepId}.heading`)}
      hint={stepId === 'place' ? undefined : t(`onboarding.${stepId}.hint`)}
      resumed={resumedAtStep === step}
      error={formError}
      busy={saving}
      finishLabel={t('onboarding.finish')}
      onBack={() => setStep(step - 1)}
      onNext={next}
      onClose={onClose}
    >
      {stepId === 'place' && (
        <>
          <WizardField id={id('countryCode')} label={t('phaseFields.country')} error={errorOf('countryCode')} valid={hasText(answers.countryCode) && errorOf('countryCode') === undefined}>
            <CountrySelect
              id={id('countryCode')}
              value={answers.countryCode}
              onChange={pickCountry}
              placeholder={t('demographics.typeToSearch')}
              invalid={errorOf('countryCode') !== undefined}
              describedBy={describedBy('countryCode')}
            />
          </WizardField>
          <WizardField id={id('city')} label={t('phaseFields.city')} error={errorOf('city')} valid={hasText(answers.city) && errorOf('city') === undefined}>
            <input
              id={id('city')}
              className="form-input"
              autoComplete="off"
              maxLength={80}
              value={answers.city}
              onChange={(event) => change('city', keepNameCharacters(event.target.value))}
              aria-invalid={errorOf('city') !== undefined || undefined}
              aria-describedby={describedBy('city')}
            />
          </WizardField>
          {/* The home starts today unless the person says otherwise: one quiet link, not one more question. */}
          {earlier ? (
            <WizardField id={id('movedIn')} label={t('phaseFields.movedIn')} error={errorOf('movedIn')} valid={errorOf('movedIn') === undefined}>
              <input
                id={id('movedIn')}
                type="date"
                className="form-input"
                max={today}
                value={answers.movedIn === '' ? today : answers.movedIn}
                onChange={(event) => change('movedIn', clampDateYear(event.target.value))}
                aria-invalid={errorOf('movedIn') !== undefined || undefined}
                aria-describedby={describedBy('movedIn')}
              />
            </WizardField>
          ) : (
            <button type="button" className="profile-text-button" onClick={() => setEarlier(true)}>
              {t('onboarding.movedEarlier')}
            </button>
          )}
        </>
      )}

      {stepId === 'income' && (
        <div className="wizard__row">
          <WizardField id={id('currency')} label={t('phaseFields.currency')}>
            <select id={id('currency')} className="form-input" value={answers.currency} onChange={(event) => change('currency', event.target.value)}>
              {currencies.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </WizardField>
          <WizardField id={id('monthlyIncome')} label={t('onboarding.income.field')} error={errorOf('monthlyIncome')} valid={incomeMinor !== undefined && errorOf('monthlyIncome') === undefined}>
            <input
              id={id('monthlyIncome')}
              className="form-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder={t('phaseFields.incomePlaceholder')}
              value={answers.monthlyIncome}
              onChange={(event) => change('monthlyIncome', keepDecimal(event.target.value))}
              aria-invalid={errorOf('monthlyIncome') !== undefined || undefined}
              aria-describedby={describedBy('monthlyIncome')}
            />
          </WizardField>
        </div>
      )}

      {stepId === 'rent' && (
        <>
          <WizardField id={id('rent')} label={t('onboarding.rent.field')} error={errorOf('rent')} valid={rentMinor !== undefined && errorOf('rent') === undefined}>
            <input
              id={id('rent')}
              className="form-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="1,200"
              disabled={answers.paysNoRent}
              value={answers.paysNoRent ? '' : answers.rent}
              onChange={(event) => change('rent', keepDecimal(event.target.value))}
              aria-invalid={errorOf('rent') !== undefined || undefined}
              aria-describedby={describedBy('rent')}
            />
          </WizardField>
          <label className="profile-check">
            <input type="checkbox" checked={answers.paysNoRent} onChange={(event) => change('paysNoRent', event.target.checked)} />
            {t('onboarding.rent.none')}
          </label>
        </>
      )}

      <KnownLine known={known} />
    </WizardModal>
  );
}
