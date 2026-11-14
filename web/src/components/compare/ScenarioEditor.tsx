'use client';
import { useId, useState } from 'react';
import { Modal } from '../Modal';
import { NumberField } from '../NumberField';
import { CATEGORY_GROUPS } from '@/lib/data/kind';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { DAYS, periodProblem } from '@/lib/scenario/period';
import type { Scenario } from '@/lib/scenario/scenario';

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

/**
 * One scenario's name, site, landing and stay, changed on their own: the lander, the mast and Earth's height are one
 * button away, in the lander dialog. A landing whose stay does not fit the Sun and Earth table is said in plain words
 * and not taken.
 */
export function ScenarioEditor({
  scenario,
  sites,
  onChange,
  onLander,
  onClose,
}: {
  scenario: Scenario;
  sites: Site[];
  onChange: (patch: Partial<Omit<Scenario, 'id'>>) => void;
  onLander: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [label, setLabel] = useState(scenario.label);
  const [date, setDate] = useState(scenario.startUtc.slice(0, 10));
  const [problem, setProblem] = useState<string | null>(null);
  const choices = sites.filter((s) => s.category !== 'custom' || s.id === scenario.siteId);
  const known = choices.some((s) => s.id === scenario.siteId);
  const land = (startUtc: string, days = scenario.days) => {
    const why = periodProblem(startUtc, days);
    setProblem(why);
    if (!why) onChange({ startUtc, days, timing: 'set' });
  };
  return (
    <Modal title={`Change “${scenario.label}”`} onClose={onClose}>
      <div className="mt-4 grid gap-4">
        <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
          Name
          <input
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label.trim() && onChange({ label: label.trim() })}
            className="field w-full"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
          Site
          <select value={scenario.siteId} onChange={(e) => onChange({ siteId: e.target.value })} className="field w-full">
            {!known && <option value={scenario.siteId}>{scenario.siteId}</option>}
            {/* The sites in the site list's groups, so a long list reads by kind of place; a clicked point stands alone. */}
            {choices
              .filter((s) => s.category === 'custom')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {siteLabel(s)}
                </option>
              ))}
            {CATEGORY_GROUPS.map((g) => {
              const inGroup = choices.filter((s) => g.categories.includes(s.category));
              return inGroup.length === 0 ? null : (
                <optgroup key={g.name} label={g.name}>
                  {inGroup.map((s) => (
                    <option key={s.id} value={s.id}>
                      {siteLabel(s)}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        <div className="flex flex-wrap gap-4">
          <label htmlFor={`${id}-date`} className="flex flex-col gap-1.5 text-[15px] text-ink-2">
            Landing date (UTC)
            <input
              id={`${id}-date`}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) land(`${e.target.value}T${scenario.startUtc.slice(11, 19)}`);
              }}
              className="field w-[190px]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[15px] text-ink-2">
            Landing hour (UTC)
            <select value={scenario.startUtc.slice(11, 16)} onChange={(e) => land(`${scenario.startUtc.slice(0, 10)}T${e.target.value}:00`)} className="field w-[130px]">
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </label>
          <NumberField label="Stay (days)" value={scenario.days} min={DAYS.min} max={DAYS.max} step={1} onChange={(d) => land(scenario.startUtc, d)} className="w-[130px]" />
        </div>
        {problem && (
          <p role="status" className="text-[15px] text-bad">
            {problem}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onLander} className="btn">
            Lander, mast and Earth’s height…
          </button>
          <button type="button" onClick={onClose} className="btn btn-ink">
            Done
          </button>
        </p>
      </div>
    </Modal>
  );
}
