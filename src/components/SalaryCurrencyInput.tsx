"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

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
  const listboxId = useId();
  const displayValue = useMemo(() => formatSalaryReadable(amount), [amount]);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const currencyWrapRef = useRef<HTMLDivElement>(null);

  const triggerLabel = useMemo(() => {
    if (currencies.length === 0) return "—";
    if (currency && currencies.some((c) => c.code === currency)) return currency;
    return currencies[0]?.code ?? "—";
  }, [currencies, currency]);

  const toggleCurrencyOpen = useCallback(() => {
    if (currencies.length === 0) return;
    setCurrencyOpen((o) => !o);
  }, [currencies.length]);

  const onTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleCurrencyOpen();
      }
    },
    [toggleCurrencyOpen],
  );

  useEffect(() => {
    if (!currencyOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = currencyWrapRef.current;
      if (el && !el.contains(e.target as Node)) setCurrencyOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [currencyOpen]);

  useEffect(() => {
    if (!currencyOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCurrencyOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currencyOpen]);

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
        <div className="salary-currency-input__currency-wrap" ref={currencyWrapRef}>
          <button
            type="button"
            className={`salary-currency-input__currency-trigger${currencyOpen ? " salary-currency-input__currency-trigger--open" : ""}`}
            disabled={currencies.length === 0}
            aria-expanded={currencyOpen}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-label="Currency"
            onClick={toggleCurrencyOpen}
            onKeyDown={onTriggerKeyDown}
          >
            <span className="salary-currency-input__currency-code">{triggerLabel}</span>
            <span className="salary-currency-input__trigger-caret" aria-hidden>
              {currencyOpen ? "▴" : "▾"}
            </span>
          </button>
          {currencyOpen && currencies.length > 0 ? (
            <div id={listboxId} role="listbox" className="salary-currency-input__dropdown">
              {currencies.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="option"
                  aria-selected={currency === c.code}
                  className={`salary-currency-input__dropdown-option${currency === c.code ? " salary-currency-input__dropdown-option--selected" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onCurrencyChange(c.code);
                    setCurrencyOpen(false);
                  }}
                >
                  {c.code}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </label>
  );
}
