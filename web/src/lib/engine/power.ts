import type { Series } from './metrics';

export type PanelModel = 'horizontal' | 'vertical' | 'vertical_tracking' | 'full_tracking';

export interface PowerConfig {
  panel: PanelModel;
  /** Azimuth the panel normal faces for the fixed vertical model (degrees clockwise from north). */
  panelAzimuthDeg: number;
  areaM2: number;
  /** Cell efficiency as a fraction (0.30 = 30 %). */
  efficiency: number;
  loadW: number;
  batteryWh: number;
  initialSocFraction: number;
}

export const SOLAR_CONSTANT_WM2 = 1361;

export const DEFAULT_POWER: PowerConfig = {
  panel: 'vertical_tracking',
  panelAzimuthDeg: 0,
  areaM2: 4,
  efficiency: 0.3,
  loadW: 200,
  batteryWh: 2000,
  initialSocFraction: 1,
};

export const PANEL_LABELS: Record<PanelModel, string> = {
  horizontal: 'Horizontal (flat deck)',
  vertical: 'Vertical, fixed azimuth',
  vertical_tracking: 'Vertical, turns to the Sun',
  full_tracking: 'Two-axis tracking',
};

const D2R = Math.PI / 180;

/**
 * Cosine of the angle between the panel normal and the Sun, clamped at 0 (Sun behind the panel).
 * The Sun's elevation may be slightly negative and still lit: high points see below the geometric
 * horizon (skyline dip), and the disk fraction already says whether any of the Sun is visible; only
 * the horizontal model goes dark there, through its own sin(el) < 0.
 */
export function panelCosine(panel: PanelModel, panelAzimuthDeg: number, sunAzDeg: number, sunElDeg: number): number {
  const el = sunElDeg * D2R;
  let c: number;
  switch (panel) {
    case 'horizontal':
      c = Math.sin(el);
      break;
    case 'vertical':
      c = Math.cos(el) * Math.cos((sunAzDeg - panelAzimuthDeg) * D2R);
      break;
    case 'vertical_tracking':
      c = Math.cos(el);
      break;
    case 'full_tracking':
      c = 1;
      break;
  }
  return c > 0 ? c : 0;
}

/** Irradiance on a Sun-facing surface: the solar constant scaled by 1/au² and the visible disk fraction. */
export function irradianceWm2(sunAu: number, sunFraction: number): number {
  return (SOLAR_CONSTANT_WM2 / (sunAu * sunAu)) * sunFraction;
}

/** Hourly panel output in W. */
export function powerSeries(series: Series, cfg: PowerConfig): Float64Array {
  const out = new Float64Array(series.hours);
  const k = cfg.efficiency * cfg.areaM2;
  for (let h = 0; h < series.hours; h++) {
    out[h] = k * irradianceWm2(series.sunAu[h], series.sunFraction[h]) * panelCosine(cfg.panel, cfg.panelAzimuthDeg, series.sunAz[h], series.sunEl[h]);
  }
  return out;
}

export interface PowerResult {
  powerW: Float64Array;
  /** Battery energy after each hour (Wh). */
  energyWh: Float64Array;
  socMin: number;
  brownoutHours: number;
  firstBrownoutHour: number | null;
  survives: boolean;
  meanPowerW: number;
}

/** Hourly battery walk: charge with the surplus, discharge for the deficit, brownout when the deficit exceeds the stored energy. */
export function simulateBattery(powerW: Float64Array, cfg: PowerConfig, dtH = 1): PowerResult {
  const n = powerW.length;
  const cap = Math.max(0, cfg.batteryWh);
  const energyWh = new Float64Array(n);
  let e = Math.min(cap, Math.max(0, cfg.initialSocFraction) * cap);
  let socMin = cap > 0 ? e / cap : 0;
  let brownoutHours = 0;
  let firstBrownoutHour: number | null = null;
  let sum = 0;
  for (let h = 0; h < n; h++) {
    sum += powerW[h];
    let next = e + (powerW[h] - cfg.loadW) * dtH;
    if (next < 0) {
      brownoutHours++;
      if (firstBrownoutHour === null) firstBrownoutHour = h;
      next = 0;
    }
    e = Math.min(cap, next);
    energyWh[h] = e;
    const soc = cap > 0 ? e / cap : 0;
    if (soc < socMin) socMin = soc;
  }
  return { powerW, energyWh, socMin, brownoutHours, firstBrownoutHour, survives: brownoutHours === 0, meanPowerW: n ? sum / n : 0 };
}

export function powerBudget(series: Series, cfg: PowerConfig): PowerResult {
  return simulateBattery(powerSeries(series, cfg), cfg);
}
