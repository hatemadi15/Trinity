import { DEFAULT_POWER, type PowerConfig } from './engine/power';

/** A ready-made lander: a name to call it by, with its numbers beside it so nobody has to guess what "small" means. */
export interface LanderPreset {
  id: 'small' | 'medium' | 'large';
  label: string;
  power: Pick<PowerConfig, 'areaM2' | 'loadW' | 'batteryWh'>;
}

export const LANDER_PRESETS: LanderPreset[] = [
  { id: 'small', label: 'Small lander: 4 m² panel, uses 200 W, 2 kWh battery', power: { areaM2: 4, loadW: 200, batteryWh: 2000 } },
  { id: 'medium', label: 'Medium lander: 8 m² panel, uses 400 W, 20 kWh battery', power: { areaM2: 8, loadW: 400, batteryWh: 20000 } },
  { id: 'large', label: 'Large lander: 20 m² panel, uses 500 W, 50 kWh battery', power: { areaM2: 20, loadW: 500, batteryWh: 50000 } },
];

/** The preset these settings are, or null when any field differs from it or from the defaults around it. */
export function presetOf(power: PowerConfig): LanderPreset | null {
  const plain = power.panel === DEFAULT_POWER.panel && power.efficiency === DEFAULT_POWER.efficiency && power.initialSocFraction === DEFAULT_POWER.initialSocFraction;
  if (!plain) return null;
  return LANDER_PRESETS.find((p) => p.power.areaM2 === power.areaM2 && p.power.loadW === power.loadW && p.power.batteryWh === power.batteryWh) ?? null;
}

export function landerName(power: PowerConfig): string {
  return presetOf(power)?.label ?? 'Custom lander';
}

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const watts = (w: number) => (w >= 1000 ? `${num(w / 1000)} kW` : `${num(w)} W`);

/** One line that says what the lander is: "4 m² panel that turns to the Sun, uses 200 W, 2 kWh battery". */
export function landerLine(power: PowerConfig): string {
  const area = `${num(power.areaM2)} m² panel`;
  const panel =
    power.panel === 'horizontal'
      ? `flat ${area}`
      : power.panel === 'vertical'
        ? `upright ${area} facing ${num(power.panelAzimuthDeg)}°`
        : power.panel === 'vertical_tracking'
          ? `${area} that turns to the Sun`
          : `${area} that follows the Sun`;
  return `${panel}, uses ${watts(power.loadW)}, ${num(power.batteryWh / 1000)} kWh battery`;
}

/** Hours the full battery carries the lander with no sunlight. */
export function batteryHours(power: PowerConfig): number {
  return power.loadW > 0 ? power.batteryWh / power.loadW : Infinity;
}
