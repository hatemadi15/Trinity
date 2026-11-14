'use client';
import Link from 'next/link';
import { useId, useState } from 'react';
import { BY_POWER, PRIORITY_PROFILES, profileOf, validPriorities, type Priorities, type RankBy } from '@/lib/plan/rank';
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
        {label} ({unit})
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

/** The priorities as the ranking's list names them, with their weights: "Priorities: mostly power (5, 1, 1)". */
export const PRIORITY_CHOICES = PRIORITY_PROFILES.map((p) => ({ value: `weighed:${p.id}`, label: `Priorities: ${p.label[0].toLowerCase()}${p.label.slice(1)} (${p.priorities.power}, ${p.priorities.contact}, ${p.priorities.gap})`, priorities: p.priorities }));

/**
 * Three boxes for weights of one's own, 0 to 100 each: power, Earth in view while powered, shorter gaps. A value the rule
 * can use is taken as it is typed (all three at 0 is not), the rest wait in the box and go back on leaving it.
 */
export function PriorityBoxes({ value, onChange }: { value: Priorities; onChange: (p: Priorities) => void }) {
  const [draft, setDraft] = useState<Partial<Record<keyof Priorities, string>>>({});
  const boxes: [keyof Priorities, string][] = [
    ['power', 'Power'],
    ['contact', 'Earth in view'],
    ['gap', 'Shorter gaps'],
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {boxes.map(([key, label]) => (
        <label key={key} className="flex min-w-0 flex-col gap-1.5 text-[15px] text-ink-2">
          <span>{label}</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={1}
            value={draft[key] ?? String(value[key])}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft((d) => ({ ...d, [key]: raw }));
              const next = { ...value, [key]: Number(raw) };
              if (raw.trim() !== '' && validPriorities(next)) onChange(next);
            }}
            onBlur={() => setDraft((d) => ({ ...d, [key]: undefined }))}
            className="field w-full min-w-0"
          />
        </label>
      ))}
    </div>
  );
}

/**
 * How the options are ranked once the requirements are counted: the longest time with power (the default), or the
 * priorities, by name or with weights of one's own. The rule itself is stated with the options below.
 */
export function RankFields({ value, onChange }: { value: RankBy; onChange: (by: RankBy) => void }) {
  const [own, setOwn] = useState(false);
  const named = value.kind === 'weighed' ? profileOf(value.priorities) : null;
  const choice = value.kind === 'power' ? 'power' : own || named === 'custom' ? 'weighed:custom' : `weighed:${named}`;
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="font-medium text-ink">
        Then rank by
      </label>
      <select
        id={id}
        value={choice}
        onChange={(e) => {
          const v = e.target.value;
          setOwn(v === 'weighed:custom');
          if (v === 'power') onChange(BY_POWER);
          else if (v === 'weighed:custom') onChange({ kind: 'weighed', priorities: value.kind === 'weighed' ? value.priorities : { power: 1, contact: 1, gap: 1 } });
          else {
            const p = PRIORITY_CHOICES.find((c) => c.value === v);
            if (p) onChange({ kind: 'weighed', priorities: { ...p.priorities } });
          }
        }}
        className="field w-full min-w-0 sm:max-w-[26em]"
      >
        <option value="power">The longest time with power</option>
        {PRIORITY_CHOICES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
        <option value="weighed:custom">Priorities: your own weights</option>
      </select>
      {choice === 'weighed:custom' && value.kind === 'weighed' && <PriorityBoxes value={value.priorities} onChange={(priorities) => onChange({ kind: 'weighed', priorities })} />}
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

/** One option: named by its title (its other words are read as its content), with its checks, trade-offs, reason and action. */
function OptionItem({ o, against, onLand }: { o: OptionView; against: string; onLand: (startUtc: string) => void }) {
  const id = useId();
  return (
    <li aria-labelledby={id} className="border-t border-line pt-2.5">
      <p id={id} className="font-medium text-ink">
        {o.title}
      </p>
      {o.summary && <p>{o.summary}</p>}
      <Checks checks={o.checks} />
      {o.score && <p className="mt-1 text-ink-2">{o.score}</p>}
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
  );
}

function Options({ title, search, against, options, onLand, note = null }: { title: string; search: string | null; against: string; options: OptionView[]; onLand: (startUtc: string) => void; note?: string | null }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="font-medium text-ink">{title}</h3>
      {search && <p className="text-ink-2">{search}</p>}
      {note && <p className="text-ink-2">{note}</p>}
      {options.length === 0 ? (
        !note && <p className="text-ink-2">None found.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {options.map((o) => (
            <OptionItem key={o.key} o={o} against={against} onLand={onLand} />
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
      {plan.current.score && <p className="text-ink-2">{plan.current.score}</p>}
      <Options title="Other landing times in this period" search={plan.times.search} against="Against landing at the period start" options={plan.times.options} onLand={onLand} />
      {(plan.places || plan.placesNote) && <Options title="Places nearby" search={plan.places?.search ?? null} against="Against this site" options={plan.places?.options ?? []} onLand={onLand} note={plan.placesNote} />}
      {plan.year && <Options title="Over the next 12 months" search={plan.year.search} against="Against the date the search started from" options={plan.year.options} onLand={onLand} />}
    </div>
  );
}
