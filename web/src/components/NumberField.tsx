'use client';
import { useState } from 'react';

/**
 * A number field that lets the user type through out-of-range values on the way to a valid one ("5"
 * on the way to "500"): the draft shows while the field has focus, a valid value is committed as it
 * is typed, and an invalid draft goes back to the last valid value on blur.
 */
export function NumberField({ label, value, min, max, step, onChange, className = 'w-36' }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const valid = (raw: string) => {
    const v = Number(raw);
    return raw !== '' && Number.isFinite(v) && v >= min && v <= max;
  };
  return (
    <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
      {label}
      <input
        type="number"
        value={draft ?? String(value)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          if (valid(e.target.value)) onChange(Number(e.target.value));
        }}
        onBlur={() => setDraft(null)}
        className={`field ${className}`}
      />
    </label>
  );
}
