/** Offline feature generation using the same measured-data engine as the app; no training labels here. */
import fs from 'node:fs';
import path from 'node:path';
import { loadEphemeris, type EphemerisHeader } from '../src/lib/engine/ephemeris';
import { hourlySeries, summarize } from '../src/lib/engine/metrics';
import { DEFAULT_POWER, powerBudget } from '../src/lib/engine/power';
import { utcToEt } from '../src/lib/engine/time';
import { LANDER_PRESETS } from '../src/lib/lander';
import type { Site } from '../src/lib/data/loaders';

const root = path.resolve(process.cwd(), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
const sites: Site[] = [...read('sites.json').sites, ...read('sites_derived.json').sites].filter((s: Site) => s.polar);
const eph = loadEphemeris(new Uint8Array(fs.readFileSync(path.join(root, 'data/ephemeris/moon_me_2024_2036_1h.f32'))), read('ephemeris/moon_me_2024_2036_1h.json') as EphemerisHeader);
const heldSites = sites.filter((_, i) => i % 4 === 0).map((s) => s.id);
const rows = [];
for (const year of [2027, 2028]) for (const site of sites) {
  const mask = Float64Array.from(read(`masks/${site.id}.json`).elevation_deg as number[]);
  for (let month = 1; month <= 12; month++) for (const days of [14, 30, 90]) {
    const startUtc = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;
    const series = hourlySeries(site, mask, eph, utcToEt(startUtc), days * 24);
    const summary = summarize(series);
    for (const preset of LANDER_PRESETS) {
      const power = powerBudget(series, { ...DEFAULT_POWER, ...preset.power });
      const poweredHours = power.firstBrownoutHour ?? series.hours;
      let contactHours = 0;
      for (let h = 0; h < poweredHours; h++) contactHours += series.earthVisible[h];
      rows.push({ site: site.id, startUtc, days, lander: preset.id, poweredHours, contactHours, longestEarthGapHours: summary.longestEarthGapH,
        split: year === 2028 ? 'temporal_test' : heldSites.includes(site.id) ? 'site_validation' : 'train' });
    }
  }
}
const output = path.join(root, 'data/recommendation');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify({ version: 1, description: 'Simulated metrics from DE440/LOLA, 2 m mast, zero Earth clearance, three illustrative landers. Preferences are not expert labels.', heldSites, rows }, null, 1) + '\n');
console.log(`Generated ${rows.length} scenario metrics across ${sites.length} polar catalogue points.`);
