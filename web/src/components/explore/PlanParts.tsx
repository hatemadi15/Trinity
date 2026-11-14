'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Requirements } from '@/lib/plan/requirements';
import type { OptionView, PlanView } from '@/lib/viz/answer';

/** Each requirement's box: its words, its unit, the hours one unit stands for, and the most it takes. */
const FIELDS: { key: keyof Requirements; label: string; unit: string; scale: number; max: number }[] = [
  { key: 'minPoweredH', label: 'Power for at least', unit: 'days', scale: 24, max: 90 },
  { key: 'contactWithinH', label: 'Earth in view within', unit: 'hours of landing; 0 for the landing hour', scale: 1, max: 2160 },
  { key: 'maxOutageH', label: 'Longest time without Earth while powered at most', unit: 'days', scale: 24, max: 90 },
  { key: 'minPoweredContactH', label: 'Earth contact while powered at least', unit: 'hours', scale: 1, max: 2160 },
];

/**
 * One requirement: a number box that may be left empty, which means no requirement. A number in range is taken as it is
 * typed; one out of range waits in the box until it is a number the search can use, and goes back on leaving the box.
 */
function RequirementField({ label, unit, scale, max, hours, onChange }: { label: string; unit: string; scale: number; max: number; hours: number | null; onChange: (h: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (hours === null ? '' : String(Math.round((hours / scale) * 100) / 100));
  return (
    <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
      <span>
        {label} <span className="whitespace-nowrap">({unit})</span>
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={max}
        step={scale === 24 ? 0.5 : 1}
        value={shown}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw.trim() === '') return onChange(null);
          const v = Number(raw);
          if (Number.isFinite(v) && v >= 0 && v <= max) onChange(Math.round(v * scale));
        }}
        onBlur={() => setDraft(null)}
        className="field w-32"
      />
    </label>
  );
}

/** The mission's requirements, each box empty for none: the recommendations above are ranked and checked against them. */
export function RequirementsFields({ value, onChange }: { value: Requirements; onChange: (patch: Partial<Requirements>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-medium text-ink">Your requirements</h3>
      <p className="max-w-[42em] text-ink-2">What the mission needs. Leave a box empty for no requirement; every choice is then checked against the ones you set.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <RequirementField key={f.key} label={f.label} unit={f.unit} scale={f.scale} max={f.max} hours={value[f.key]} onChange={(h) => onChange({ [f.key]: h })} />
        ))}
      </div>
    </div>
  );
}

/** A requirement met or failed, said in a word before its numbers, in the colour of its state. */
function Checks({ checks }: { checks: { met: boolean; words: string }[] }) {
  if (checks.length === 0) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {checks.map((c) => (
        <li key={c.words}>
          <span className={`font-medium ${c.met ? 'text-good' : 'text-bad'}`}>{c.met ? 'Meets' : 'Fails'}</span> {c.words}
        </li>
      ))}
    </ul>
  );
}

function Options({ title, search, against, options, onLand }: { title: string; search: string; against: string; options: OptionView[]; onLand: (startUtc: string) => void }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="font-medium text-ink">{title}</h3>
      <p className="text-ink-2">{search}</p>
      {options.length === 0 ? (
        <p className="text-ink-2">None found.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {options.map((o) => (
            <li key={o.key} aria-label={o.title} className="border-t border-line pt-2.5">
              <p className="font-medium text-ink">{o.title}</p>
              {o.summary && <p>{o.summary}</p>}
              <Checks checks={o.checks} />
              <p className="mt-1 text-ink-2">
                {against}: {o.trade}
              </p>
              {o.perSite && <p className="text-ink-2">{o.perSite}</p>}
              {o.why && <p className="mt-1">{o.why}</p>}
              {o.land && (
                <button type="button" onClick={() => onLand(o.land!)} className="btn btn-sm mt-2">
                  {o.action}
                </button>
              )}
              {o.href && (
                <Link href={o.href} className="mt-1 inline-flex min-h-10 items-center font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                  {o.action}
                </Link>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Every option behind the panel's recommendations, for a planner: what they are ranked by, how a failed requirement
 * counts, and each list (landing times in the period, places nearby, the 12-month search's) with how finely it was
 * searched and, for each option, its checks, its trade-offs against the current choice and why it ranks above the next.
 */
export function OptionsList({ plan, onLand }: { plan: PlanView; onLand: (startUtc: string) => void }) {
  return (
    <div className="flex max-w-[46em] flex-col gap-4 text-ink">
      <p>
        {plan.objective}
        {plan.rule && ` ${plan.rule}`}
      </p>
      <p>
        <span className="font-medium">{plan.current.title}</span>
        {plan.current.summary && `: ${plan.current.summary}`}
      </p>
      <Checks checks={plan.current.checks} />
      <Options title="Other landing times in this period" search={plan.times.search} against="Against landing at the period start" options={plan.times.options} onLand={onLand} />
      {plan.places && <Options title="Places nearby" search={plan.places.search} against="Against this site" options={plan.places.options} onLand={onLand} />}
      {plan.year && <Options title="Over the next 12 months" search={plan.year.search} against="Against the date the search started from" options={plan.year.options} onLand={onLand} />}
    </div>
  );
}
