"use client";

import { useCallback, useRef, useState } from "react";

type Props = {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  clearable?: boolean;
};

export function FreeTextChipsField({
  label,
  values,
  onChange,
  placeholder = "Type and press Enter…",
  clearable = false,
}: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commitDraft = useCallback(() => {
    const next = draft.trim();
    if (!next) return;
    const exists = values.some((v) => v.trim().toLowerCase() === next.toLowerCase());
    if (exists) {
      setDraft("");
      return;
    }
    onChange([...values, next]);
    setDraft("");
  }, [draft, onChange, values]);

  const removeAt = useCallback(
    (index: number) => {
      onChange(values.filter((_, i) => i !== index));
    },
    [onChange, values],
  );

  const clearAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange([]);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitDraft();
        return;
      }
      if (e.key === "Backspace" && draft === "" && values.length > 0) {
        e.preventDefault();
        onChange(values.slice(0, -1));
      }
    },
    [commitDraft, draft, onChange, values],
  );

  return (
    <div className="multi-select-chips field free-text-chips-field">
      <span className="multi-select-chips__label">{label}</span>
      <div
        className="multi-select-chips__trigger free-text-chips-field__trigger"
        onClick={() => inputRef.current?.focus()}
      >
        <div className="multi-select-chips__inner free-text-chips-field__inner">
          {values.map((v, i) => (
            <span key={`${i}:${v}`} className="multi-select-chips__pill free-text-chips-field__pill">
              <span>{v}</span>
              <button
                type="button"
                className="multi-select-chips__pill-x"
                aria-label={`Remove ${v}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            className="free-text-chips-field__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={values.length === 0 ? placeholder : ""}
            aria-label={label}
            autoComplete="off"
          />
        </div>
        {clearable && values.length > 0 ? (
          <button
            type="button"
            className="free-text-chips-field__clear"
            aria-label={`Clear ${label}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={clearAll}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
