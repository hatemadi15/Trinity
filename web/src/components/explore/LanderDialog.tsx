'use client';
import { useState, type RefObject } from 'react';
import { Modal } from '@/components/Modal';
import { NumberField } from '@/components/NumberField';
import { DEFAULT_POWER, type PanelModel, type PowerConfig } from '@/lib/engine/power';
import { batteryHours, LANDER_PRESETS, presetOf } from '@/lib/lander';
import { PARAM_RANGES, percentRange, POWER_RANGES } from '@/lib/planner-ranges';
import type { PlannerParams } from '@/lib/store/explore';
import { spanWords } from '@/lib/viz/format';

const PANELS: [PanelModel, string][] = [
  ['vertical_tracking', 'Upright, turns to the Sun'],
  ['vertical', 'Upright, fixed'],
  ['horizontal', 'Flat on the deck'],
  ['full_tracking', 'Follows the Sun in two axes'],
];

const dark = (power: Pick<PowerConfig, 'batteryWh' | 'loadW'>) => `${spanWords(batteryHours({ ...DEFAULT_POWER, ...power }))} at night`;

function Choice({ name, checked, onChange, title, note }: { name: string; checked: boolean; onChange: () => void; title: string; note: string }) {
  return (
    <label className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-lg border px-4 py-2.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sun-ink ${checked ? 'border-ink bg-surface-2' : 'border-line-strong'}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-4 w-4 accent-[var(--ink)]" />
      <span>
        <span className="font-medium text-ink">{title}</span>
        <span className="text-ink-2"> {note}</span>
      </span>
    </label>
  );
}

/** The lander: three ready-made ones, named small, medium and large with their numbers, and every field under "Custom". */
export function LanderDialog({
  params,
  onPower,
  onParams,
  busy,
  onClose,
  returnFocus,
}: {
  params: PlannerParams;
  onPower: (p: Partial<PowerConfig>) => void;
  onParams: (p: Partial<PlannerParams>) => void;
  busy: boolean;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const p = params.power;
  const preset = presetOf(p);
  const [custom, setCustom] = useState(preset === null);
  const showCustom = custom || preset === null;
  return (
    <Modal title="The lander" onClose={onClose} returnFocus={returnFocus} wide>
      <p className="mt-2 text-ink-2">What the lander needs decides how long it lasts. Pick one, or set your own numbers. All three ready-made landers use a {Math.round(DEFAULT_POWER.efficiency * 100)}&nbsp;% panel.</p>
      <div role="radiogroup" aria-label="Lander" className="mt-4 grid gap-2.5">
        {LANDER_PRESETS.map((x) => (
          <Choice
            key={x.id}
            name="lander"
            checked={!showCustom && preset?.id === x.id}
            onChange={() => {
              setCustom(false);
              onPower({ ...x.power, panel: DEFAULT_POWER.panel, panelAzimuthDeg: DEFAULT_POWER.panelAzimuthDeg, efficiency: DEFAULT_POWER.efficiency, initialSocFraction: DEFAULT_POWER.initialSocFraction });
            }}
            title={x.label}
            note={`(${dark(x.power)})`}
          />
        ))}
        <Choice name="lander" checked={showCustom} onChange={() => setCustom(true)} title="Custom" note="(your own panel, load and battery)" />
      </div>

      {showCustom && (
        <div className="mt-5 border-t border-line pt-5">
          <div role="radiogroup" aria-label="Solar panel" className="grid gap-2 sm:grid-cols-2">
            {PANELS.map(([model, label]) => (
              <label key={model} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-ink">
                <input type="radio" name="panel" checked={p.panel === model} onChange={() => onPower({ panel: model })} className="h-4 w-4 accent-[var(--ink)]" />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-4">
            {p.panel === 'vertical' && <NumberField label="Panel faces (° from north)" value={p.panelAzimuthDeg} {...POWER_RANGES.panelAzimuthDeg} onChange={(v) => onPower({ panelAzimuthDeg: v })} />}
            <NumberField label="Panel area (m²)" value={p.areaM2} {...POWER_RANGES.areaM2} onChange={(v) => onPower({ areaM2: v })} />
            <NumberField label="Panel efficiency (%)" value={Math.round(p.efficiency * 100)} {...percentRange(POWER_RANGES.efficiency)} onChange={(v) => onPower({ efficiency: v / 100 })} />
            <NumberField label="Lander uses (W)" value={p.loadW} {...POWER_RANGES.loadW} onChange={(v) => onPower({ loadW: v })} />
            <NumberField label="Battery (Wh)" value={p.batteryWh} {...POWER_RANGES.batteryWh} onChange={(v) => onPower({ batteryWh: v })} />
            <NumberField label="Battery at landing (%)" value={Math.round(p.initialSocFraction * 100)} {...percentRange(POWER_RANGES.initialSocFraction)} onChange={(v) => onPower({ initialSocFraction: v / 100 })} />
            <NumberField label="Earth at least this high above the hills (°)" value={params.minEarthElDeg} {...PARAM_RANGES.minEarthElDeg} onChange={(v) => onParams({ minEarthElDeg: v })} className="w-full sm:w-72" />
            <NumberField label="Mast height (m)" value={params.mastM} {...PARAM_RANGES.mastM} onChange={(v) => onParams({ mastM: v })} />
          </div>
          <p className="mt-4 max-w-[52em] text-[15px] text-ink-2">A taller mast sees over more of the hills{busy ? '; the view from the new height is being worked out…' : '.'}</p>
        </div>
      )}

      {/* How the power is worked out holds for the ready-made landers too, so it shows whichever is chosen. */}
      <p className="mt-4 max-w-[52em] text-[15px] text-ink-2">
        The panel makes its share of full sunlight (1361 W on each square metre at Earth&apos;s distance), reduced by the part of the Sun behind a hill and by the angle of the panel. The battery fills when the panel makes
        more than the lander uses and empties when it makes less.
      </p>
    </Modal>
  );
}
