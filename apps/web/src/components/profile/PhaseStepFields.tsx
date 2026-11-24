import { intlLocale } from '../../i18n/locale';
import { useTranslation } from '../../i18n/useTranslation';
import { useMemo } from "react";
import { HOUSING_TENURES } from "../../contracts";
import { currencyOptions } from "../../lib/currencies";
import { clampDateYear, keepDecimal, keepNameCharacters } from "../../lib/inputFilters";
import WizardField from "../wizard/WizardField";
import CarryJobs from "./CarryJobs";
import type { CarryCandidate, CarryChoice } from "./carryOver";
import CountrySelect from "./CountrySelect";
import { TENURE_LABELS } from "./labels";
import type { PhaseFormState } from "./phaseForm";
import type { PhaseStepId } from "./phaseForm";
import type { PhaseFormFeedback } from "./usePhaseFormFeedback";

interface PhaseStepFieldsProps {
  step: PhaseStepId;
  /** Keeps ids unique when more than one flow is on the page. */
  idPrefix: string;
  form: PhaseFormState;
  onChange: <K extends keyof PhaseFormState>(
    key: K,
    value: PhaseFormState[K],
  ) => void;
  feedback: PhaseFormFeedback;
  /** Today, as a calendar day: nothing later can be picked. */
  today: string;
  /** Asks for a first income. Left out when changing an existing home, whose income is listed on its own. */
  includeIncome?: boolean;
  /** The previous home's jobs that could carry on here, when there are any. */
  carry?: { candidates: readonly CarryCandidate[]; choice: CarryChoice; onChange: (choice: CarryChoice) => void };
}

/** The questions of one step of "Add a living phase". The same steps serve the first-time flow and the phase editor. */
export default function PhaseStepFields({
  step,
  idPrefix,
  form,
  onChange,
  feedback,
  today,
  includeIncome = true,
  carry,
}: PhaseStepFieldsProps) {
  const { t, locale } = useTranslation();
  const currencies = useMemo(() => currencyOptions(intlLocale(locale)), [locale]);
  const id = (field: keyof PhaseFormState) => `${idPrefix}-${field}`;
  const describedBy = (field: keyof PhaseFormState) =>
    feedback.errorOf(field) ? `${id(field)}-error` : undefined;

  if (step === "place") {
    return (
      <>
        <WizardField
          id={id("countryCode")}
          label={t('phaseFields.country')}
          error={feedback.errorOf("countryCode")}
          valid={feedback.isValid("countryCode")}
        >
          <CountrySelect
            id={id("countryCode")}
            value={form.countryCode}
            onChange={(code) => onChange("countryCode", code)}
            placeholder={t('demographics.typeToSearch')}
            invalid={feedback.errorOf("countryCode") !== undefined}
            describedBy={describedBy("countryCode")}
          />
        </WizardField>
        <WizardField
          id={id("city")}
          label={t('phaseFields.city')}
          error={feedback.errorOf("city")}
          valid={feedback.isValid("city")}
        >
          <input
            id={id("city")}
            className="form-input"
            autoComplete="off"
            maxLength={80}
            value={form.city}
            onChange={(event) =>
              onChange("city", keepNameCharacters(event.target.value))
            }
            aria-invalid={feedback.errorOf("city") !== undefined || undefined}
            aria-describedby={describedBy("city")}
          />
        </WizardField>
        <WizardField
          id={id("address")}
          label={t('phaseFields.address')}
          error={feedback.errorOf("address")}
          valid={feedback.isValid("address")}
        >
          <input
            id={id("address")}
            className="form-input"
            autoComplete="off"
            maxLength={200}
            value={form.address}
            onChange={(event) => onChange("address", event.target.value)}
            aria-describedby={describedBy("address")}
          />
        </WizardField>
      </>
    );
  }

  if (step === "dates") {
    return (
      <>
        <div className="wizard__row">
          <WizardField
            id={id("startDate")}
            label={t('phaseFields.movedIn')}
            error={feedback.errorOf("startDate")}
            valid={feedback.isValid("startDate")}
          >
            <input
              id={id("startDate")}
              type="date"
              className="form-input"
              max={today}
              value={form.startDate}
              onChange={(event) =>
                onChange("startDate", clampDateYear(event.target.value))
              }
              aria-invalid={
                feedback.errorOf("startDate") !== undefined || undefined
              }
              aria-describedby={describedBy("startDate")}
            />
          </WizardField>
          <WizardField
            id={id("endDate")}
            label={t('phaseFields.movedOut')}
            error={feedback.errorOf("endDate")}
            valid={!form.stillLivingHere && feedback.isValid("endDate")}
          >
            <input
              id={id("endDate")}
              type="date"
              className="form-input"
              max={today}
              value={form.endDate}
              disabled={form.stillLivingHere}
              onChange={(event) =>
                onChange("endDate", clampDateYear(event.target.value))
              }
              aria-invalid={
                feedback.errorOf("endDate") !== undefined || undefined
              }
              aria-describedby={describedBy("endDate")}
            />
          </WizardField>
        </div>
        <label className="profile-check">
          <input
            type="checkbox"
            checked={form.stillLivingHere}
            onChange={(event) =>
              onChange("stillLivingHere", event.target.checked)
            }
          />
          {t('phaseFields.stillLiving')}
        </label>
      </>
    );
  }

  // The last step: the money.
  return (
      <>
        <div className="wizard__row">
          <WizardField id={id("currency")} label={t('phaseFields.currency')}>
            <select
              id={id("currency")}
              className="form-input"
              value={form.currency}
              onChange={(event) => onChange("currency", event.target.value)}
            >
              {currencies.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </WizardField>
          {includeIncome && (
            <WizardField
              id={id("monthlyIncome")}
              label={t('phaseFields.income')}
              error={feedback.errorOf("monthlyIncome")}
              valid={feedback.isValid("monthlyIncome")}
            >
              <input
                id={id("monthlyIncome")}
                className="form-input"
                inputMode="decimal"
                autoComplete="off"
                placeholder={t('phaseFields.incomePlaceholder')}
                value={form.monthlyIncome}
                onChange={(event) =>
                  onChange("monthlyIncome", keepDecimal(event.target.value))
                }
                aria-invalid={
                  feedback.errorOf("monthlyIncome") !== undefined || undefined
                }
                aria-describedby={describedBy("monthlyIncome")}
              />
            </WizardField>
          )}
          {carry && (
            <CarryJobs
              candidates={carry.candidates}
              choice={carry.choice}
              currency={form.currency}
              onChange={carry.onChange}
            />
          )}
        </div>
        <WizardField id={id("tenure")} label={t('phaseFields.housing')}>
          <select
            id={id("tenure")}
            className="form-input"
            value={form.tenure}
            onChange={(event) =>
              onChange("tenure", event.target.value as PhaseFormState["tenure"])
            }
          >
            {HOUSING_TENURES.map((tenure) => (
              <option key={tenure} value={tenure}>
                {t(TENURE_LABELS[tenure])}
              </option>
            ))}
          </select>
        </WizardField>
      </>
  );
}
