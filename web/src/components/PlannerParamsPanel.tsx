'use client';
import { useState } from 'react';
import { PANEL_LABELS, type PanelModel, type PowerConfig } from '@/lib/engine/power';
import type { PlannerParams } from '@/lib/store/explore';

interface NumField {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

/**
 * A controlled number field that lets the user type through out-of-range intermediates ("5" on the
 * way to "500"): the draft is shown while the field has focus, valid values are committed as they
 * are typed, and an invalid draft reverts to the last committed value on blur.
 */
function NumberInput({ label, value, min, max, step, onChange }: NumField) {
  const [draft, setDraft] = useState<string | null>(null);
  const valid = (raw: string) => {
    const v = Number(raw);
    return raw !== '' && Number.isFinite(v) && v >= min && v <= max;
  };
  return (
    <label className="flex flex-col gap-1 text-sm text-ink-2">
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
        className="w-28 rounded-md border border-line bg-panel px-2 py-1 text-ink"
      />
    </label>
  );
}

/** Collapsible planner settings: solar panel, battery, load, comms threshold and mast height. */
export function PlannerParamsPanel({
  params,
  onParams,
  onPower,
  busy,
}: {
  params: PlannerParams;
  onParams: (p: Partial<PlannerParams>) => void;
  onPower: (p: Partial<PowerConfig>) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const p = params.power;
  return (
    <section aria-label="Planner settings" className="rounded-md bg-panel px-4 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-1 text-left text-sm text-ink"
      >
        <span>
          Planner settings: {PANEL_LABELS[p.panel]}, {p.areaM2} m², {p.loadW} W load, {p.batteryWh} Wh battery, Earth above{' '}
          {params.minEarthElDeg}°, mast {params.mastM} m
        </span>
        <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-x-6 gap-y-3 py-3">
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1 text-ink-2">Solar panel</legend>
            {(Object.keys(PANEL_LABELS) as PanelModel[]).map((m) => (
              <label key={m} className="flex items-center gap-2 text-ink">
                <input type="radio" name="panel" checked={p.panel === m} onChange={() => onPower({ panel: m })} aria-label={PANEL_LABELS[m]} />
                {PANEL_LABELS[m]}
              </label>
            ))}
          </fieldset>
          {p.panel === 'vertical' && (
            <NumberInput label="Panel faces azimuth (°)" value={p.panelAzimuthDeg} min={0} max={360} step={5} onChange={(v) => onPower({ panelAzimuthDeg: v })} />
          )}
          <NumberInput label="Panel area (m²)" value={p.areaM2} min={0.5} max={50} step={0.5} onChange={(v) => onPower({ areaM2: v })} />
          <NumberInput label="Cell efficiency (%)" value={Math.round(p.efficiency * 100)} min={5} max={45} step={1} onChange={(v) => onPower({ efficiency: v / 100 })} />
          <NumberInput label="Load (W)" value={p.loadW} min={10} max={2000} step={10} onChange={(v) => onPower({ loadW: v })} />
          <NumberInput label="Battery (Wh)" value={p.batteryWh} min={100} max={50000} step={100} onChange={(v) => onPower({ batteryWh: v })} />
          <NumberInput label="Battery at start (%)" value={Math.round(p.initialSocFraction * 100)} min={0} max={100} step={5} onChange={(v) => onPower({ initialSocFraction: v / 100 })} />
          <NumberInput label="Minimum Earth elevation (°)" value={params.minEarthElDeg} min={0} max={10} step={0.5} onChange={(v) => onParams({ minEarthElDeg: v })} />
          <NumberInput label="Mast height (m)" value={params.mastM} min={0} max={10} step={1} onChange={(v) => onParams({ mastM: v })} />
          <p className="basis-full text-xs text-ink-3">
            Power = efficiency × area × 1361 W/m² ÷ AU² × visible Sun fraction × panel cosine; the battery charges with the surplus
            and empties on the deficit. Mast height recomputes the selected site’s skyline{busy ? ' (computing…)' : ''}.
          </p>
        </div>
      )}
    </section>
  );
}
