// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VersionsClient } from '@/lib/ensemble/client';
import type { VersionsSummary } from '@/lib/ensemble/figures';
import { readJson } from '@/lib/engine/__tests__/helpers';
import { NO_REQUIREMENTS } from '@/lib/plan/requirements';
import { baselineFrom } from '@/lib/scenario/scenario';
import { DEFAULT_PARAMS, recompute } from '@/lib/store/explore';
import type { ScenarioRun } from '@/lib/store/scenarios';
import { eph, sites } from '@/test/file-loaders';
import { cellWords, VersionsCell } from './VersionsCell';

const summary = (s: Partial<VersionsSummary>): VersionsSummary => ({
  versions: 32,
  poweredH: [74, 79],
  firstSunsetH: [66, 69],
  noSunset: 0,
  longestNightH: [396, 402],
  poweredContactH: [0, 0],
  basis: 'verdict',
  held: 32,
  main: { poweredH: 76, allPeriod: false, firstSunsetH: 67, longestNightH: 399, poweredContactH: 0, meets: null },
  ...s,
});
const ready = (s: Partial<VersionsSummary>) => ({ status: 'ready' as const, result: { summary: summary(s), holdsByHour: null }, ms: 1 });

describe('the terrain versions in a cell of the comparison', () => {
  it('says how many versions keep the scenario’s verdict, or meet the requirements, and the range of its time with power', () => {
    expect(cellWords(ready({}), 30)).toEqual({ held: '32 of 32 keep its verdict', power: 'power 3 d 2 h to 3 d 7 h' });
    expect(cellWords(ready({ basis: 'requirements', held: 20, poweredH: [700, 720] }), 30)).toEqual({ held: '20 of 32 meet your requirements', power: 'power 29 d 4 h to all 30 days' });
    expect(cellWords({ status: 'working' }, 30)).toEqual({ held: 'working out…', power: null });
    expect(cellWords({ status: 'none', reason: 'a point picked on the map has none' }, 30)?.held).toBe('none here');
    expect(cellWords({ status: 'none', reason: null }, 30)).toBeNull();
  });

  it('works a scenario out over its site’s versions from the scenario’s own figures', async () => {
    const site = sites.find((s) => s.id === 'de_gerlache_rim_2')!;
    const mask = Float64Array.from(readJson<{ elevation_deg: number[] }>('data', 'masks', 'de_gerlache_rim_2.json').elevation_deg);
    const scenario = baselineFrom({ siteId: site.id, startUtc: '2027-01-01T00:00:00', days: 30, params: DEFAULT_PARAMS }, 'a');
    const result = recompute(eph, site, mask, scenario.startUtc, 30);
    const run: ScenarioRun = { key: 'k', status: 'ready', site, result, outcome: null, mask: null, error: null };
    const col = { scenario, site, siteName: 'de Gerlache Rim 2', outcome: null };
    const load = async () => ({ siteId: site.id, mastM: 2, adjusted: mask, masks: [mask, mask, mask] });
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <VersionsCell col={col} run={run} requirements={NO_REQUIREMENTS} deps={{ load, runner: new VersionsClient() }} />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    await waitFor(() => expect(screen.getByText('3 of 3 keep its verdict')).toBeTruthy());
  });
});
