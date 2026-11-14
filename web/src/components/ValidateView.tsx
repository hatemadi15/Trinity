'use client';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { AppFrame } from './AppFrame';
import { DataProblem } from './DataProblem';
import { dataBase, loadEphemerisFromUrl } from '@/lib/data/loaders';
import { degreesText } from '@/lib/data/home';
import { exploreStore } from '@/lib/store/explore';
import { loadValidation, type BackcastRow, type ValidationDocs } from '@/lib/data/validation';
import { PANEL_LABELS, type PanelModel } from '@/lib/engine/power';
import type { HorizonsBody } from '@/lib/horizons/query';
import { recheckSite, type RecheckResult } from '@/lib/horizons/recheck';
import { evidenceCards, sumsResults, type EvidenceCard } from '@/lib/viz/checks';
import { UncertaintySection } from './UncertaintySection';
import { VersionsSection } from './VersionsSection';
import { testRunWords, type TestRun } from '@/lib/report/testRun';

type Recheck = (site: { lat: number; lon: number }, body: HorizonsBody, epochsUtc: string[]) => Promise<RecheckResult>;

/** Eight epochs across 2026 (seven equal intervals) for the live JPL comparison. */
export const RECHECK_EPOCHS = ['2026-01-01T00:00:00', '2026-02-22T03:00:00', '2026-04-15T06:00:00', '2026-06-06T09:00:00', '2026-07-28T12:00:00', '2026-09-18T15:00:00', '2026-11-09T18:00:00', '2026-12-31T21:00:00'];

/** Module-scope defaults: a stable identity, so the loading effect runs once per mount and not on every render. */
const defaultLoad = () => loadValidation(dataBase());

async function defaultRecheck(site: { lat: number; lon: number }, body: HorizonsBody, epochs: string[]): Promise<RecheckResult> {
  // The Explore store may already hold the ephemeris (same tab, earlier visit); otherwise fetch it once here.
  const eph = exploreStore.getState().eph ?? (await loadEphemerisFromUrl(dataBase()));
  return recheckSite(site, body, epochs, eph);
}

/** Plain words for why the live re-check failed; the raw message is for developers and is added only outside production. */
function recheckProblem(message: string): string {
  if (/abort|time(d)? ?out/i.test(message)) return 'JPL did not answer in time';
  if (/HTTP 5\d\d/.test(message)) return 'JPL is busy just now';
  return 'JPL could not be reached (no internet here?)';
}

const exp1 = (x: number) => `${x.toExponential(1)}°`;
/** A gap in the page's five decimals, or "under 0.00001°" where those would read as none: the direction's gap is about 3e-6°. */
const gapText = (deg: number) => (Math.abs(deg) < 0.000005 ? 'under 0.00001°' : degreesText(deg));
const pctOf = (x: number) => `${(x * 100).toFixed(1)} %`;
const signedPoints = (p: number) => `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1)} points`;
const signedHours = (h: number) => `${h >= 0 ? '+' : '−'}${Math.abs(h).toFixed(1)} h`;
/** A tiny gap in watts: none at all, or its size in powers of ten. */
const wattsGap = (w: number) => (w === 0 ? '0 W' : `${w.toExponential(1)} W`);
const utcShort = (iso: string | null) => (iso ? iso.replace('T', ' ').replace(':00Z', ' UTC').replace('Z', ' UTC') : '—');
const dayWords = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const TH = 'border-b-2 border-ink py-2 pr-4 text-left text-[15px] font-semibold text-ink-2';
const TD = 'border-b border-line py-2 pr-4 text-[15px]';
const NUM = `${TD} text-right tabular-nums`;
const H3 = 'mt-6 text-[17px] font-semibold text-ink';
const NOTE = 'mt-3 max-w-[62em] break-words text-[15px] leading-relaxed text-ink-2';
/** The page's verdict in one line, by how many of the three checks meet their criteria: the count of the panels' own pass marks, never worked out again. */
const VERDICT = ['No check meets its criteria', 'One of three checks meets its criteria', 'Two of three checks meet their criteria', 'Three checks meet their criteria'];

function Mark({ pass }: { pass: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {pass ? <path d="M4 12.5l5 5L20 6.5" /> : <path d="M6 6l12 12M18 6L6 18" />}
    </svg>
  );
}

/**
 * One kind of evidence: its mark (a pass mark for a check, neutral words for context), figure and sentence, its
 * labelled parts (what it shows, when it passes, what it was tested on, what it leaves out), anything it adds (the
 * live re-check), and its numbers on request.
 */
function EvidencePanel({ card, extra, children }: { card: EvidenceCard; extra?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const tone = card.pass === null ? 'text-ink-2' : card.pass ? 'text-good' : 'text-bad';
  return (
    <section aria-labelledby={`${id}-h`} data-kind={card.kind} className="panel">
      <h2 id={`${id}-h`} className="display text-[26px] font-semibold leading-tight">
        {card.title}
      </h2>
      <p data-part="mark" className={`mt-2 flex items-center gap-2 font-semibold ${tone}`}>
        {card.pass !== null && <Mark pass={card.pass} />}
        {card.mark}
      </p>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-3">
        <span className="display text-[40px] leading-none tabular-nums">{card.figure}</span>
        <span className="text-ink-2">{card.figureWords}</span>
      </p>
      <p data-part="sentence" className="mt-3 max-w-[46em] leading-relaxed text-ink-2">{card.sentence}</p>
      <dl className="mt-4 grid max-w-[62em] gap-x-6 gap-y-2 text-[15px] leading-relaxed sm:grid-cols-[10.5em_1fr]">
        {card.parts.map((p) => (
          <div key={p.label} className="contents">
            <dt className="font-semibold text-ink">{p.label}</dt>
            <dd className="text-ink-2 max-sm:mb-1">{p.text}</dd>
          </div>
        ))}
      </dl>
      {extra}
      <button type="button" aria-expanded={open} aria-controls={`${id}-n`} onClick={() => setOpen((v) => !v)} className="btn mt-4">
        {open ? 'Hide the numbers' : 'Show the numbers'}
      </button>
      {open && <p className="mt-3 text-[15px] text-ink-2 sm:hidden">Swipe the table sideways to see every column.</p>}
      <div id={`${id}-n`} hidden={!open} className="mt-4 overflow-x-auto">
        {open && children}
      </div>
    </section>
  );
}

/**
 * Accuracy: four kinds of evidence. Three checks (the Sun's and Earth's directions against JPL Horizons, sunlight
 * against NASA's LOLA maps worked out the map's way, the power sums against worked answers), each with its pass
 * mark, what it shows, its rule, what it was tested on and what it leaves out; then past missions as context, with
 * no pass mark. The live re-check with JPL sits in the first.
 * Then how sure the times are, the error budget and the automated tests' last run: what passed, was skipped
 * and failed, when, on which commit, with which data.
 */
export function ValidateView({ load = defaultLoad, recheck = defaultRecheck }: { load?: () => Promise<ValidationDocs>; recheck?: Recheck }) {
  const [docs, setDocs] = useState<ValidationDocs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<{ state: 'idle' } | { state: 'busy' } | { state: 'done'; result: RecheckResult }>({ state: 'idle' });
  // The automated tests' last run, as npm run validation:tests recorded it.
  const [badge, setBadge] = useState<TestRun | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => {
        if (!cancelled) setDocs(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    fetch('/validation/tests.json')
      .then((r) => (r.ok ? (r.json() as Promise<TestRun>) : null))
      .then((b) => {
        if (!cancelled && b) setBadge(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (error) {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <DataProblem
            error={error}
            what="checks"
            hint={
              <>
                Run <code className="text-ink">uv run python -m lunar_pipeline.cli sync-local</code> inside <code className="text-ink">pipeline/</code> and reload: it copies the tables committed in{' '}
                <code className="text-ink">data/validation</code>.
              </>
            }
          />
        </main>
      </AppFrame>
    );
  }
  if (!docs) {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <p className="text-ink-2">Loading the checks…</p>
        </main>
      </AppFrame>
    );
  }
  const { horizons, mazarico, power, backcasts } = docs;
  const cards = evidenceCards(docs);
  const [directions, sunlight, sums, missions] = cards;
  const verdict = `${VERDICT[cards.filter((card) => card.kind === 'check' && card.pass).length]}; past missions are context, not a check.`;
  const liveSite = horizons.sites.find((s) => s.site_id === 'shackleton_center') ?? horizons.sites[0];
  const ref = mazarico.reference;
  const names = new Map(mazarico.rows.map((r) => [r.site_id, r.name]));

  async function runRecheck() {
    if (!liveSite) return;
    setLive({ state: 'busy' });
    try {
      const result = await recheck({ lat: liveSite.lat, lon: liveSite.lon }, 'SUN', RECHECK_EPOCHS);
      setLive({ state: 'done', result });
    } catch (err) {
      // A thrown error (for example the ephemeris failing to load) must not leave the button disabled.
      setLive({ state: 'done', result: { ok: false, message: err instanceof Error ? err.message : String(err) } });
    }
  }

  const recheckBlock = !liveSite ? undefined : (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void runRecheck()} disabled={live.state === 'busy'} className="btn btn-primary">
        Re-check with JPL now
      </button>
      <span className="text-[15px] text-ink-2" aria-live="polite">
        {live.state === 'idle' && `Asks JPL for the Sun at ${liveSite.name} at eight moments in 2026 (about 12 s at most).`}
        {live.state === 'busy' && 'Asking JPL…'}
        {live.state === 'done' &&
          (live.result.ok
            ? `${live.result.n} moments compared just now: the largest gap was ${gapText(live.result.worstEl)} in height and ${gapText(live.result.worstAzCosEl)} in direction (${(live.result.ms / 1000).toFixed(1)} s)`
            : `${recheckProblem(live.result.message)}, so the stored comparison stands: the largest gap was ${degreesText(horizons.max_abs_delta_el_deg)}.${process.env.NODE_ENV !== 'production' ? ` [${live.result.message}]` : ''}`)}
      </span>
    </div>
  );

  return (
    <AppFrame>
      <main className="wrap flex flex-col gap-6 pb-14 pt-8">
        <div>
          <h1 data-band-end="" className="display text-[44px] leading-tight sm:text-[56px]">Accuracy</h1>
          <p className="mt-3 max-w-[42em] text-lg leading-relaxed text-ink-2">What each check shows, how it was tested, and its limits.</p>
        </div>

        <p className="text-base font-semibold text-ink">{verdict}</p>

        <EvidencePanel card={directions} extra={recheckBlock}>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Site</th>
                <th className={TH}>Body</th>
                <th className={`${TH} text-right`}>Rows</th>
                <th className={`${TH} text-right`}>Largest gap in height</th>
                <th className={`${TH} text-right`}>Largest gap in direction</th>
                <th className={TH}>Query</th>
              </tr>
            </thead>
            <tbody>
              {horizons.sites.map((s) => (
                <tr key={`${s.site_id}-${s.body}`}>
                  <td className={TD}>{s.name}</td>
                  <td className={TD}>{s.body === 'SUN' ? 'Sun' : 'Earth'}</td>
                  <td className={NUM}>{s.n_rows}</td>
                  <td className={NUM}>{exp1(s.max_abs_delta_el_deg)}</td>
                  <td className={NUM}>{exp1(s.max_abs_delta_az_cos_el_deg)}</td>
                  <td className={TD}>
                    <a href={s.query_url} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                      JPL query
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={NOTE}>JPL&apos;s settings: {horizons.evidence.reference.settings}. Ours: {horizons.evidence.ours.frame}, {horizons.evidence.ours.abcorr}, from {horizons.evidence.ours.kernels.join(', ')}.</p>
        </EvidencePanel>

        <EvidencePanel card={sunlight}>
          <p className="mb-3 max-w-[62em] break-words text-[15px] leading-relaxed text-ink-2">
            NASA&apos;s maps: <code>{ref.sun.product_id}</code> and <code>{ref.earth.product_id}</code> (LOLA team, label {ref.sun.product_version_id}, made {dayWords(ref.sun.product_creation_time)}), 60 m per pixel south of 85° S. {ref.averaging}{' '}
            {ref.observer} Its label: &ldquo;{ref.sun.description}&rdquo;
          </p>
          <p className="mb-3 max-w-[62em] text-[15px] leading-relaxed text-ink-2">
            Ours, one change at a time: the app&apos;s own share (2 m mast, LOLA 20 to 240 m terrain, hourly {dayWords(mazarico.period[0])} to {dayWords(mazarico.period[1])}); then from the ground; then hourly over 18.6 years from{' '}
            {dayWords(mazarico.evidence.coverage.matched_span[0])}; then on 60 m terrain at the map&apos;s four nearest pixels, which is the map&apos;s way. The gap is that last step minus the map.
          </p>
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Site</th>
                <th className={`${TH} text-right`}>The app: 2 m mast</th>
                <th className={`${TH} text-right`}>From the ground</th>
                <th className={`${TH} text-right`}>Over 18.6 years</th>
                <th className={`${TH} text-right`}>On 60 m terrain</th>
                <th className={`${TH} text-right`}>NASA&apos;s map</th>
                <th className={`${TH} text-right`}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {mazarico.rows.map((r) => (
                <tr key={r.site_id}>
                  <td className={TD}>{r.name}</td>
                  {r.covered && r.sun ? (
                    <>
                      <td className={NUM}>{pctOf(r.sun.app)}</td>
                      <td className={NUM}>{pctOf(r.sun.surface)}</td>
                      <td className={NUM}>{pctOf(r.sun.cycle)}</td>
                      <td className={NUM}>{pctOf(r.sun.matched)}</td>
                      <td className={NUM}>{pctOf(r.sun.map)}</td>
                      <td className={NUM}>{signedPoints(r.sun.gap_points)}</td>
                    </>
                  ) : (
                    <td colSpan={6} className={`${TD} text-ink-2`}>
                      not covered by the 85° S map
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className={H3}>Earth in view</h3>
          <p className="mb-3 mt-1 max-w-[62em] text-[15px] leading-relaxed text-ink-2">
            The app counts Earth as in view when its centre clears the hills; NASA&apos;s map counts any part of its disc, and so does our share worked out the map&apos;s way (from the ground, over 18.6 years, on 60 m terrain).
          </p>
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Site</th>
                <th className={`${TH} text-right`}>The app: Earth&apos;s centre</th>
                <th className={`${TH} text-right`}>Ours: any part of Earth</th>
                <th className={`${TH} text-right`}>NASA&apos;s map</th>
                <th className={`${TH} text-right`}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {mazarico.rows
                .filter((r) => r.covered && r.earth)
                .map((r) => (
                  <tr key={r.site_id}>
                    <td className={TD}>{r.name}</td>
                    <td className={NUM}>{pctOf(r.earth!.app_centre)}</td>
                    <td className={NUM}>{pctOf(r.earth!.matched_any)}</td>
                    <td className={NUM}>{pctOf(r.earth!.map)}</td>
                    <td className={NUM}>{signedPoints(r.earth!.gap_points)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {mazarico.rows
            .filter((r) => r.note)
            .map((r) => (
              <p key={r.site_id} className={NOTE}>
                {r.name}: {r.note}
              </p>
            ))}
          <h3 className={H3}>What the comparison could not match</h3>
          <ul className="mt-2 flex max-w-[62em] list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink-2">
            {(mazarico.evidence.unmatched ?? []).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={NOTE}>
            Sources: {ref.sources.join('; ')}. Labels read: {ref.sun.file} and {ref.earth.file} (SHA-256 {ref.sun.label_sha256.slice(0, 12)}… and {ref.earth.label_sha256.slice(0, 12)}…). Made by{' '}
            <code>{mazarico.evidence.command}</code>.
          </p>
        </EvidencePanel>

        <EvidencePanel card={sums}>
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Case</th>
                <th className={TH}>By hand</th>
                <th className={`${TH} text-right`}>Pipeline: largest gap</th>
                <th className={`${TH} text-right`}>This browser: largest gap</th>
              </tr>
            </thead>
            <tbody>
              {sumsResults(power).map((s) => (
                <tr key={s.id}>
                  <td className={TD}>{s.words}</td>
                  <td className={TD}>{s.hand}</td>
                  <td className={NUM}>{wattsGap(s.pipelineGapW)}</td>
                  <td className={NUM}>{wattsGap(s.gapW)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={NOTE}>
            {power.recorded_runs.length} recorded runs the app&apos;s automated tests compare with the pipeline on every change, rerun by the pipeline today against its record:{' '}
            {power.recorded_runs
              .map((r) => `${names.get(r.site_id) ?? r.site_id} from ${dayWords(r.start_utc)}, ${r.days} days, ${(PANEL_LABELS[r.panel as PanelModel] ?? r.panel).toLowerCase()} (${r.agrees ? 'agrees' : 'differs'})`)
              .join('; ')}
            .
          </p>
        </EvidencePanel>

        <EvidencePanel card={missions}>
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Mission</th>
                <th className={TH}>Landed</th>
                <th className={`${TH} text-right`}>Sun at landing</th>
                <th className={TH}>Predicted sunset</th>
                <th className={TH}>Reported end</th>
                <th className={`${TH} text-right`}>End − sunset</th>
                <th className={TH}>Horizon</th>
              </tr>
            </thead>
            <tbody>
              {backcasts.rows.map((r: BackcastRow) => (
                <tr key={r.site_id}>
                  <td className={TD}>{r.name}</td>
                  <td className={`${TD} tabular-nums`}>{utcShort(r.landed_utc)}</td>
                  <td className={NUM}>{r.sun_el_at_landing_deg.toFixed(1)}°</td>
                  <td className={`${TD} tabular-nums`}>{utcShort(r.sunset_utc)}</td>
                  <td className={`${TD} tabular-nums`}>{utcShort(r.mission_end_utc)}</td>
                  <td className={NUM}>{r.end_minus_sunset_h === null ? '—' : signedHours(r.end_minus_sunset_h)}</td>
                  <td className={TD}>{r.skyline === 'lola' ? 'measured hills' : 'flat'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 flex flex-col gap-3 text-[15px]">
            {backcasts.rows.map((r) => (
              <li key={r.site_id} className="flex flex-col gap-0.5">
                <span className="text-ink">
                  {r.name}: {r.mission_note ?? 'no note for this mission yet'}
                </span>
                <span className="text-ink-2">Source: {r.mission_end_source ?? 'not recorded'}</span>
              </li>
            ))}
          </ul>
        </EvidencePanel>

        <UncertaintySection />

        <VersionsSection />

        <section aria-labelledby="h-budget" className="panel">
          <h2 id="h-budget" className="display text-[26px] font-semibold">
            How far off the forecast can be
          </h2>
          <ul className="mt-3 flex max-w-[62em] flex-col gap-2 leading-relaxed text-ink-2">
            <li>Sunrise, sunset and Earth rising or setting: within the margins measured above, site by site. The hourly steps alone put each change up to an hour late; near the pole the terrain data can move it by many hours.</li>
            <li>Directions to the Sun and Earth: under 0.01° (the first check finds {degreesText(horizons.max_abs_delta_el_deg)}).</li>
            <li>The height of the hills around a site: within a degree of NASA&apos;s adjusted south-pole maps in 95 % of directions at every featured site (compared above); the app follows its own maps to 0.01°.</li>
          </ul>
          {badge && <p className="mt-4 text-[15px] text-ink-2">{testRunWords(badge).join(' ')}</p>}
        </section>
      </main>
    </AppFrame>
  );
}
