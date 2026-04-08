"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type MultiSelectOption = { id: string; label: string };

type Props = {
  label: string;
  options: MultiSelectOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  placeholder?: string;
};

export function MultiSelectChips({
  label,
  options,
  selected,
  onChange,
  placeholder = "Select…",
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const toggleOpen = useCallback(() => setOpen((o) => !o), []);

  const onTriggerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleOpen();
      }
    },
    [toggleOpen],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleId = useCallback(
    (id: string) => {
      onChange((() => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      })());
    },
    [onChange, selected],
  );

  const removeId = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onChange((() => {
        const next = new Set(selected);
        next.delete(id);
        return next;
      })());
    },
    [onChange, selected],
  );

  const optionById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.id, o.label);
    return m;
  }, [options]);

  return (
    <div ref={rootRef} className="multi-select-chips field">
      <span className="multi-select-chips__label">{label}</span>
      <div
        role="button"
        tabIndex={0}
        className={`multi-select-chips__trigger${open ? " multi-select-chips__trigger--open" : ""}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={toggleOpen}
        onKeyDown={onTriggerKeyDown}
      >
        <div className="multi-select-chips__inner">
          {selected.size === 0 ? (
            <span className="multi-select-chips__placeholder">{placeholder}</span>
          ) : (
            [...selected].map((id) => (
              <span key={id} className="multi-select-chips__pill" role="presentation">
                <span>{optionById.get(id) ?? id}</span>
                <button
                  type="button"
                  className="multi-select-chips__pill-x"
                  aria-label={`Remove ${optionById.get(id) ?? id}`}
                  onClick={(e) => removeId(id, e)}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
      </div>
      {open ? (
        <div className="multi-select-chips__dropdown">
          {options.map((o) => (
            <label key={o.id} className="multi-select-chips__row">
              <input
                type="checkbox"
                checked={selected.has(o.id)}
                onChange={() => toggleId(o.id)}
              />
              {o.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
