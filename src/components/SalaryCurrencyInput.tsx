"use client";

import { useCallback, useMemo } from "react";

export type SalaryCurrencyItem = { code: string; name: string; in_use?: boolean };

const MAX_INT_DIGITS = 12;
const MAX_FRAC_DIGITS = 2;

/**
 * Canonical string: "", "20000", "20000.4", "20000.45", "20000." while typing.
 * Last `.` or `,` is the decimal separator; spaces / NBSP / commas in the integer part are stripped.
 */
export function parseSalaryAmount(raw: string): string {
  const s = raw.replace(/[\s\u202f\u00a0]/g, "");
  if (!s) return "";

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const lastDec = Math.max(lastDot, lastComma);

  let intSrc: string;
  let fracSrc: string;
  if (lastDec === -1) {
    intSrc = s;
    fracSrc = "";
  } else {
    intSrc = s.slice(0, lastDec);
    fracSrc = s.slice(lastDec + 1);
  }

  const trailingDec = lastDec !== -1 && fracSrc === "";
  let intDigits = intSrc.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (intDigits.length > MAX_INT_DIGITS) intDigits = intDigits.slice(0, MAX_INT_DIGITS);
  const fracDigits = fracSrc.replace(/\D/g, "").slice(0, MAX_FRAC_DIGITS);

  if (!intDigits && !fracDigits && !trailingDec) return "";
  if (!intDigits && fracDigits) return `0.${fracDigits}`;
  if (!intDigits && trailingDec) return "0.";
  if (fracDigits) return `${intDigits || "0"}.${fracDigits}`;
  if (trailingDec) return `${intDigits}.`;
  return intDigits;
}

/** Readable display: `20 000`, `20 000.4`, `20 000.45` (ASCII spaces in integer part). */
function formatSalaryReadable(canonical: string): string {
  if (!canonical) return "";
  const parts = canonical.split(".");
  const trailingDot = canonical.endsWith(".") && parts.length === 2 && parts[1] === "";
  const intPart = parts[0] ?? "";
  const fracPart = trailingDot ? "" : (parts[1] ?? "");
  const intDigits = intPart.replace(/\D/g, "");
  if (!intDigits && !fracPart && !trailingDot) return "";

  const intFmt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (fracPart !== "") return `${intFmt}.${fracPart}`;
  if (trailingDot) return `${intFmt}.`;
  return intFmt;
}

type Props = {
  amount: string;
  onAmountChange: (canonical: string) => void;
  onAmountBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  currency: string;
  onCurrencyChange: (code: string) => void;
  currencies: SalaryCurrencyItem[];
  label?: string;
  placeholder?: string;
};

export function SalaryCurrencyInput({
  amount,
  onAmountChange,
  onAmountBlur,
  currency,
  onCurrencyChange,
  currencies,
  label = "Salary",
  placeholder = "Optional",
}: Props) {
  const displayValue = useMemo(() => formatSalaryReadable(amount), [amount]);

  const onAmountInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = parseSalaryAmount(e.target.value);
      onAmountChange(next);
    },
    [onAmountChange],
  );

  return (
    <label className="salary-currency-field">
      <span>{label}</span>
      <div className="salary-currency-input">
        <input
          className="salary-currency-input__amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={displayValue}
          onChange={onAmountInputChange}
          onBlur={onAmountBlur}
        />
        <select
          className="salary-currency-input__currency"
          value={currency}
          onChange={(e) => onCurrencyChange(e.target.value)}
          aria-label="Currency"
        >
          {currencies.length === 0 ? (
            <option value="">—</option>
          ) : (
            currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code}
              </option>
            ))
          )}
        </select>
      </div>
    </label>
  );
}
