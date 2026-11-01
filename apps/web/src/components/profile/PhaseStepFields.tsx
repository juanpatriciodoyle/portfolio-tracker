import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { HOUSING_TENURES, type CreateFixedCostRequest } from "../../contracts";
import { currencyOptions } from "../../lib/currencies";
import { formatMinor } from "../../lib/money";
import WizardField from "../wizard/WizardField";
import CountrySelect from "./CountrySelect";
import FixedCostEditor from "./FixedCostEditor";
import { CADENCE_PHRASES, CATEGORY_LABELS, TENURE_LABELS } from "./labels";
import type { PhaseFormState } from "./phaseForm";
import type { PhaseFlowStepId } from "./phaseStepCopy";
import type { PhaseFormFeedback } from "./usePhaseFormFeedback";

interface PhaseStepFieldsProps {
  step: PhaseFlowStepId;
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
  costs: readonly CreateFixedCostRequest[];
  onCostsChange: (costs: CreateFixedCostRequest[]) => void;
  /** Asks for a first income. Left out when changing an existing home, whose income is listed on its own. */
  includeIncome?: boolean;
}

/** The questions of one step of "Add a living phase". The same steps serve the first-time flow and the phase editor. */
export default function PhaseStepFields({
  step,
  idPrefix,
  form,
  onChange,
  feedback,
  today,
  costs,
  onCostsChange,
  includeIncome = true,
}: PhaseStepFieldsProps) {
  const currencies = useMemo(() => currencyOptions(), []);
  const [addingBill, setAddingBill] = useState(false);
  const id = (field: keyof PhaseFormState) => `${idPrefix}-${field}`;
  const describedBy = (field: keyof PhaseFormState) =>
    feedback.errorOf(field) ? `${id(field)}-error` : undefined;

  if (step === "place") {
    return (
      <>
        <WizardField
          id={id("countryCode")}
          label="Country"
          error={feedback.errorOf("countryCode")}
          valid={feedback.isValid("countryCode")}
        >
          <CountrySelect
            id={id("countryCode")}
            value={form.countryCode}
            onChange={(code) => onChange("countryCode", code)}
            placeholder="Type to search, in English or Spanish"
            invalid={feedback.errorOf("countryCode") !== undefined}
            describedBy={describedBy("countryCode")}
          />
        </WizardField>
        <WizardField
          id={id("city")}
          label="City"
          error={feedback.errorOf("city")}
          valid={feedback.isValid("city")}
        >
          <input
            id={id("city")}
            className="form-input"
            autoComplete="off"
            maxLength={80}
            value={form.city}
            onChange={(event) => onChange("city", event.target.value)}
            aria-invalid={feedback.errorOf("city") !== undefined || undefined}
            aria-describedby={describedBy("city")}
          />
        </WizardField>
        <WizardField
          id={id("address")}
          label="Address (optional)"
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
            label="Moved in"
            error={feedback.errorOf("startDate")}
            valid={feedback.isValid("startDate")}
          >
            <input
              id={id("startDate")}
              type="date"
              className="form-input"
              max={today}
              value={form.startDate}
              onChange={(event) => onChange("startDate", event.target.value)}
              aria-invalid={
                feedback.errorOf("startDate") !== undefined || undefined
              }
              aria-describedby={describedBy("startDate")}
            />
          </WizardField>
          <WizardField
            id={id("endDate")}
            label="Moved out"
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
              onChange={(event) => onChange("endDate", event.target.value)}
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
          Still living here
        </label>
      </>
    );
  }

  if (step === "money") {
    return (
      <>
        <div className="wizard__row">
          <WizardField id={id("currency")} label="Currency">
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
          <WizardField id={id("tenure")} label="Housing">
            <select
              id={id("tenure")}
              className="form-input"
              value={form.tenure}
              onChange={(event) =>
                onChange(
                  "tenure",
                  event.target.value as PhaseFormState["tenure"],
                )
              }
            >
              {HOUSING_TENURES.map((tenure) => (
                <option key={tenure} value={tenure}>
                  {TENURE_LABELS[tenure]}
                </option>
              ))}
            </select>
          </WizardField>
        </div>
        {includeIncome && (
          <WizardField
            id={id("monthlyIncome")}
            label="Monthly net income (optional)"
            error={feedback.errorOf("monthlyIncome")}
            valid={feedback.isValid("monthlyIncome")}
          >
            <input
              id={id("monthlyIncome")}
              className="form-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="3,200"
              value={form.monthlyIncome}
              onChange={(event) =>
                onChange("monthlyIncome", event.target.value)
              }
              aria-invalid={
                feedback.errorOf("monthlyIncome") !== undefined || undefined
              }
              aria-describedby={describedBy("monthlyIncome")}
            />
          </WizardField>
        )}
        <WizardField
          id={id("notes")}
          label="Notes (optional)"
          error={feedback.errorOf("notes")}
          valid={feedback.isValid("notes")}
        >
          <textarea
            id={id("notes")}
            className="form-input phase-editor__notes"
            rows={2}
            maxLength={500}
            value={form.notes}
            onChange={(event) => onChange("notes", event.target.value)}
          />
        </WizardField>
      </>
    );
  }

  return (
    <>
      {costs.length > 0 && (
        <ul className="wizard-list" aria-label="Bills added">
          {costs.map((cost, position) => (
            <li key={position} className="wizard-list__item">
              <span>
                {cost.label ?? CATEGORY_LABELS[cost.category]}
                <span className="wizard-field__hint">
                  {" "}
                  · {CADENCE_PHRASES[cost.cadence]}
                </span>
              </span>
              <span>
                {formatMinor(cost.amountMinor, form.currency)}{" "}
                <button
                  type="button"
                  className="profile-icon-button"
                  aria-label={`Remove ${cost.label ?? CATEGORY_LABELS[cost.category]}`}
                  onClick={() =>
                    onCostsChange(
                      costs.filter((_, other) => other !== position),
                    )
                  }
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {addingBill ? (
        <FixedCostEditor
          currency={form.currency}
          onCancel={() => setAddingBill(false)}
          onSubmit={async (bill) => {
            onCostsChange([...costs, bill]);
            setAddingBill(false);
            return { ok: true, value: undefined };
          }}
        />
      ) : (
        <button
          type="button"
          className="profile-text-button"
          onClick={() => setAddingBill(true)}
        >
          <Plus size={14} aria-hidden="true" /> Add a bill
        </button>
      )}
    </>
  );
}
