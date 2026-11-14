'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { DataProblem, SYNC_HINT } from './DataProblem';
import { downloadNote, Downloads } from './Downloads';
import { groundWords } from './explore/GroundQuality';
import { ENERGY_ONLY, POWER_SCOPE_LINE } from './PowerScope';
import { SkylineNote } from './SkylineNote';
import { SkyRow } from './SkyRow';
import { askNarration, shortModel } from '@/lib/ai/client';
import { templateBrief } from '@/lib/ai/narrate';
import type { NarrationReply } from '@/lib/ai/protocol';
import { summarizeState, type StateSummary } from '@/lib/ai/state-summary';
import { landedWords, pointKind } from '@/lib/data/kind';
import { siteLabel, type Site } from '@/lib/data/loaders';
import { timeWithPower } from '@/lib/engine/landing';
import { landerLine } from '@/lib/lander';
import { briefHref, exploreHref, withSettings } from '@/lib/links';
import { useAddressFollows } from '@/lib/hooks/useAddressFollows';
import { useDataVersions } from '@/lib/hooks/useDataVersions';
import { collectProvenance, provenanceLines } from '@/lib/share/provenance';
import { appVersion } from '@/lib/share/versions';
import { landingWords, periodWords } from '@/lib/period';
import { FAIL_RULE, OBJECTIVE } from '@/lib/plan/rank';
import type { Check } from '@/lib/plan/requirements';
import { exploreStore, periodPlan, scanOf, seenFrom, terrainOf, type ExploreState } from '@/lib/store/explore';
import { answerFor } from '@/lib/viz/answer';
import { dateTimeUtc, dayMonth, pct0, spanShort } from '@/lib/viz/format';
import { dayTicks, hillsToward } from '@/lib/viz/timechart';
import { siteBudget, sureLines, type UncertaintyDoc } from '@/lib/uncertainty/budget';
import { useUncertainty } from '@/lib/uncertainty/useUncertainty';
import { useHoldsByHour, type VersionsDeps } from '@/lib/ensemble/useTerrainVersions';
import { BriefVersions } from './BriefVersions';
import { coldTrapSite, coldTrapWords, type ColdTrapDoc } from '@/lib/coldtraps/coldtraps';
import { useColdTraps } from '@/lib/coldtraps/useColdTraps';
import { provenanceWords, terrainDetails, terrainLimitation, trustedAnswer } from '@/lib/viz/terrain';

type Narration = { text: string; source: 'template' | 'model' | 'error'; model?: string; reason?: NarrationReply['reason']; problems?: string[]; message?: string };

/** A number and its unit on one line, as the page writes them ("100 %"). */
const keepUnits = (text: string) => text.replace(/(\d) (?=%|°|k?Wh?\b|m²)/g, '$1\u00a0');

/** The line under the summary paragraph: who wrote it, or why the template stands. */
function narrationLabelFor(n: Narration | null): string {
  if (!n) return 'written by the app from the figures below';
  if (n.source === 'model') return `narrated by ${n.model ? shortModel(n.model) : 'the model'}; each number, unit and cause checked against the figures below`;
  if (n.source === 'error') return n.message?.startsWith('Too many') ? `${n.message} Written by the app from the figures below.` : 'the assistant is offline; written by the app from the figures below';
  switch (n.reason) {
    case 'cached':
      return 'demo mode; written by the app from the figures below';
    case 'no-key':
      return 'no model configured; written by the app from the figures below';
    case 'model-error':
      return 'the model did not answer; written by the app from the figures below';
    default:
      return `the model's paragraph did not match the figures${n.problems?.length ? ` (${keepUnits(n.problems[0])})` : ''}; written by the app from the figures below`;
  }
}

const SUN_H = 96;
const EARTH_H = 80;

/** Which of LOLA's grids the skyline is traced through, by where the site lies (the engine's bands, engine/horizon.ts). */
function hillsWords(site: Pick<Site, 'lat' | 'polar'>, mast: number): string {
  if (!site.polar) return "There are no hills on this horizon: the place lies outside NASA's polar elevation grids, so the horizon is taken as flat; the Sun counts as up when any part of it clears the horizon.";
  const grids =
    site.lat <= -87.55
      ? 'NASA LRO LOLA elevation grids (20 m within 6 km, 80 m to 100 km, 240 m to 220 km)'
      : site.lat <= -80
        ? 'NASA LRO LOLA elevation grids (80 m to 100 km, 240 m to 220 km)'
        : "NASA LRO LOLA's 240 m elevation grid out to 220 km (the finer grids stop at 80° S)";
  return `The hills on the horizon are traced through ${grids} from a ${mast} m mast; the Sun counts as up when any part of it clears the hills.`;
}

/** What kind of point the site is, then when it landed: a landing before the table keeps its date, and the figures stay the period's. */
function pointWords(site: Site): string {
  const landed = landedWords(site);
  const when = !landed
    ? ''
    : landed.inTable
      ? ` It landed on ${landed.date}.`
      : ` It landed on ${landed.date}, before the years this app covers (2024 to 2036), so the figures are for the period above.`;
  return `${pointKind(site).sentence}${when}`;
}

/** Each requirement met or failed, with the value reached and the margin, as a printed list. */
function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="list-disc pl-5">
      {checks.map((c) => (
        <li key={c.id}>
          {c.met ? 'Meets' : 'Fails'} {c.words}
        </li>
      ))}
    </ul>
  );
}

/**
 * One printable page for the selected site and period: a summary paragraph, the verdict in Explore's
 * words, five figures, the Sun's and Earth's rows of the time chart, the lander, the method and the data.
 */
export function BriefView({
  store = exploreStore,
  narrate,
  uncertainty,
  versions,
  coldTraps,
}: {
  store?: StoreApi<ExploreState>;
  /** Injected in tests; by default asks /api/chat for the paragraph. */
  narrate?: (state: StateSummary) => Promise<NarrationReply>;
  /** Injected in tests; by default the app's data/uncertainty/budget.json. */
  uncertainty?: () => Promise<UncertaintyDoc>;
  /** Injected in tests; by default the site's data/ensemble file and the versions' worker. */
  versions?: VersionsDeps;
  /** Injected in tests; by default the app's data/coldtraps/coldtraps.json. */
  coldTraps?: () => Promise<ColdTrapDoc>;
}) {
  const s = useStore(store);
  const budget = useUncertainty(uncertainty);
  const coldDoc = useColdTraps(coldTraps);
  const [narration, setNarration] = useState<Narration | null>(null);
  const [writing, setWriting] = useState(false);
  // A brief opened from a link, in a new tab or another browser, shows the site, period and settings its address names;
  // once that is applied, the address follows what it shows, so the address bar can be copied and sent on.
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    const search = typeof window === 'undefined' ? '' : window.location.search;
    void store
      .getState()
      .init()
      .then(() => store.getState().applyQuery(search))
      .then(() => setLinked(true));
  }, [store]);
  useAddressFollows(s.site ? withSettings(briefHref(s.site.id, s.startUtc, s.days), s.params, s.requirements, s.rankBy) : null, linked && s.status === 'ready');
  // Back to Explore on the same site, period, settings and requirements.
  const back = s.site ? withSettings(exploreHref(s.site.id, s.startUtc, s.days), s.params, s.requirements, s.rankBy) : '/explore';
  // The period's landing times ranked with the requirements and the ranking, as Explore ranks them, so the brief names the
  // same better date: with the requirement on the terrain versions set, by how many versions each landing time holds in.
  const holds = useHoldsByHour({ site: s.site, series: s.series ? scanOf(s.series) : null, hours: s.series?.hours ?? 0, params: s.params, requirements: s.requirements, mastM: seenFrom(s.maskMeta, s.params.mastM) }, versions);
  const times = useMemo(
    () => periodPlan({ series: s.series, params: s.params, requirements: s.requirements, startUtc: s.startUtc, rankBy: s.rankBy, holds }),
    [s.series, s.params, s.requirements, s.startUtc, s.rankBy, holds],
  );
  const dataVersions = useDataVersions();
  const sunHill = useMemo(() => (s.mask && s.series ? hillsToward(s.mask, s.series.sunAz) : null), [s.mask, s.series]);
  const earthHill = useMemo(() => (s.mask && s.series ? hillsToward(s.mask, s.series.earthAz) : null), [s.mask, s.series]);
  const sunUp = useMemo(() => (s.series ? Uint8Array.from(s.series.sunFraction, (f) => (f > 0 ? 1 : 0)) : null), [s.series]);
  if (s.status !== 'ready' || !s.site || !s.series || !s.summary || !s.mask || !s.power || !sunHill || !earthHill || !sunUp || !s.eph) {
    return (
      <main className="brief mx-auto max-w-[190mm] px-8 py-8">
        {/* This page has no header, so the way back is here while loading and after a data failure. */}
        <p className="no-print mb-4">
          <Link href={back} className="text-[15px] underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            Back to Explore
          </Link>
        </p>
        {s.status === 'error' ? <DataProblem error={s.error} hint={SYNC_HINT} /> : <p>Loading NASA data…</p>}
      </main>
    );
  }
  const p = s.params.power;
  const name = siteLabel(s.site);
  // Each time with its supported margin (data/uncertainty), printed in full; the ground where the budget measured it.
  const sure = sureLines({ doc: budget, site: { id: s.site.id, polar: s.site.polar }, series: s.series, power: s.power, startUtc: s.startUtc });
  const ground = siteBudget(budget, s.site.id)?.terrain_quality ?? null;
  // The modelled cold traps near a polar site, in full: printed, so nothing waits behind a link.
  const coldSite = coldTrapSite(coldDoc, s.site.id);
  const cold = coldTrapWords(coldSite, { full: true });
  // The terrain behind the figures, and whether they are still from another mast height than the one chosen: an
  // incomplete terrain, or figures still on their way, name no better day (lib/viz/terrain).
  const terrain = s.maskMeta ? terrainOf(s.maskMeta) : undefined;
  const behind = s.maskMeta !== null && s.maskMeta.source !== 'flat' && (s.maskMeta.mastM ?? 2) !== s.params.mastM;
  const answer = trustedAnswer(answerFor({ siteName: name, series: s.series, summary: s.summary, power: s.power, startUtc: s.startUtc, days: s.days, loadW: p.loadW, batteryWh: p.batteryWh, best: s.best, plan: times, farSide: s.site.far_side, panel: p.panel }), terrain, behind);
  // With requirements set, the brief says why the better date ranks first and how each landing does against them.
  const checked = times && times.current.checks.length > 0 ? times : null;
  const limitation = terrainLimitation(terrain);
  const hours = s.days * 24;
  const powered = Math.min(hours, timeWithPower(s.power));
  const figures: [string, string][] = [
    ['Sunlight', `${pct0(s.summary.illumFraction)} of the ${s.days} days`],
    ['Radio contact while it has power', answer.contactHours > 0 ? spanShort(answer.contactHours) : 'none'],
    ['Longest night', s.summary.longestDarkH > 0 ? spanShort(s.summary.longestDarkH) : 'none'],
    ['Time with power', powered >= hours ? `all ${s.days} days` : spanShort(powered)],
    ['Battery when full', `${spanShort(p.loadW > 0 ? p.batteryWh / p.loadW : 0)} at ${p.loadW} W`],
  ];
  // The height the hills are seen from: the skyline's own; a flat horizon is the same from the chosen one.
  const mast = s.maskMeta?.source === 'flat' ? s.params.mastM : (s.maskMeta?.mastM ?? 2);
  const stateSummary = summarizeState(s);
  const template = stateSummary ? templateBrief(stateSummary) : '';
  const shown = narration && narration.source !== 'error' ? narration.text : template;
  const narrationLabel = narrationLabelFor(narration);
  async function write() {
    if (!stateSummary || writing) return;
    setWriting(true);
    try {
      const r = await (narrate ?? ((st: StateSummary) => askNarration(st, store.getState().aiMode)))(stateSummary);
      setNarration({ text: r.reply, source: r.source, model: r.model, reason: r.reason, problems: r.problems });
    } catch (err) {
      setNarration({ text: template, source: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setWriting(false);
    }
  }
  const provenance = terrain ? provenanceWords(terrain) : 'hills measured from NASA elevation data';
  const period = `the ${s.days} days from ${landingWords(s.startUtc)}`;
  const ticks = dayTicks(s.days);
  const sources = collectProvenance({ site: s.site, maskMeta: s.maskMeta, params: s.params, eph: s.eph, startUtc: s.startUtc, days: s.days }, { app: appVersion(), data: dataVersions ?? { data: null, sites: null, ephemeris: null, terrain: null } });
  // The address that opens these figures on Explore, in full, so the printed page carries it.
  const shareLink = typeof window === 'undefined' ? back : new URL(back, window.location.origin).href;
  return (
    <main className="brief mx-auto flex max-w-[190mm] flex-col gap-5 px-8 py-8">
      <div className="no-print flex items-center justify-between gap-4">
        <Link href={back} className="text-[15px] underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Back to Explore
        </Link>
        <button type="button" onClick={() => window.print()} className="btn">
          Print or save as PDF
        </button>
      </div>
      <header className="flex flex-col gap-1">
        <p className="text-[15px] text-ink-2">Earthrise mission brief</p>
        <h1 className="display text-[30px] leading-tight">{name}</h1>
        <p className="text-[15px] text-ink-2">
          {/* The period as a planner copies it: the landing with its hour in UTC, then the length. */}
          {Math.abs(s.site.lat).toFixed(3)}° {s.site.lat < 0 ? 'S' : 'N'}, {Math.abs(s.site.lon).toFixed(3)}° {s.site.lon < 0 ? 'W' : 'E'}; {periodWords(s.startUtc, s.days)}.
        </p>
        {/* What kind of point the coordinate is, so a region's centre or a derived high point never reads as a surveyed landing spot. */}
        <p className="text-[15px] text-ink-2">{pointWords(s.site)}</p>
      </header>
      <SkylineNote state={s} ids={[s.site.id]} selected />
      <section className="flex flex-col gap-1 text-[15px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-[18px] font-semibold">Mission summary</h2>
          <button type="button" onClick={() => void write()} disabled={writing} className="no-print btn h-10 px-3 text-[15px] disabled:opacity-50">
            {writing ? 'Writing…' : 'Let the assistant write it'}
          </button>
        </div>
        <p data-testid="narration" aria-live="polite">{shown}</p>
        <p className="text-ink-2">{narrationLabel}</p>
      </section>
      <section aria-labelledby="brief-verdict" className={`border-l-4 pl-4 ${answer.tone === 'good' ? 'border-good' : 'border-bad'}`}>
        <h2 id="brief-verdict" className="display text-[20px] font-semibold leading-snug">
          {answer.title}
        </h2>
        {limitation && <p className="mt-1 text-[15px] font-medium">{limitation}</p>}
        {answer.sentences.map((line) => (
          <p key={line} className="mt-1 text-[15px]">
            {line}
          </p>
        ))}
        {answer.better && <p className="mt-1 text-[15px]">{answer.better.note}</p>}
        {checked && answer.better?.why && <p className="mt-1 text-[15px]">{answer.better.why}</p>}
        {answer.hint && <p className="mt-1 text-[15px] text-ink-2">{answer.hint}</p>}
      </section>
      {checked && (
        <section aria-labelledby="brief-requirements" className="flex flex-col gap-1 text-[15px]">
          <h2 id="brief-requirements" className="display text-[18px] font-semibold">
            Your requirements
          </h2>
          <p>Landing at the period start, {dateTimeUtc(s.startUtc, 0)}:</p>
          <CheckList checks={checked.current.checks} />
          {answer.better && checked.better && (
            <>
              <p>Landing on {dateTimeUtc(s.startUtc, checked.better.item.hour)}, the better date above:</p>
              <CheckList checks={checked.better.checks} />
            </>
          )}
          <p className="text-ink-2">
            {OBJECTIVE} {FAIL_RULE}
          </p>
        </section>
      )}
      {sure.lines.length > 0 && (
        <section aria-labelledby="brief-sure" className="flex flex-col gap-1 text-[15px]">
          <h2 id="brief-sure" className="display text-[18px] font-semibold">
            How sure these times are
          </h2>
          <ul className="list-disc pl-5">
            {sure.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {sure.basis && <p className="text-ink-2">{sure.basis} The margins add the three sources; the Accuracy page gives each one apart.</p>}
        </section>
      )}
      <BriefVersions site={s.site} series={s.series} params={s.params} requirements={s.requirements} mastM={mast} startUtc={s.startUtc} days={s.days} deps={versions} />
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:grid-cols-3">
        {figures.map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink-2">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <section aria-label="The Sun and Earth, hour by hour" className="flex flex-col gap-2">
        <p className="text-[15px] font-semibold">The Sun</p>
        <div className="stage">
          <SkyRow el={s.series.sunEl} hill={sunHill} visible={sunUp} startUtc={s.startUtc} body="sun" caption={`The Sun over ${period}`} height={SUN_H} ticks={false} />
        </div>
        <p className="text-[15px] font-semibold">Earth</p>
        <div className="stage">
          <SkyRow el={s.series.earthEl} hill={earthHill} visible={s.series.earthVisible} startUtc={s.startUtc} body="earth" caption={`Earth over ${period}`} height={EARTH_H} ticks={false} />
        </div>
        <div aria-hidden="true" className="relative h-5 text-[14px] text-ink-2">
          {/* Every other day label gives way on a phone, as on Explore's chart, so none overlap. */}
          {ticks.map((d, i) => (
            <span key={d} data-day="" className={`absolute whitespace-nowrap ${i % 2 === 1 ? 'max-sm:hidden' : ''}`} style={d === 0 ? { left: 0 } : { left: `${((d * 24) / s.series!.hours) * 100}%`, transform: 'translateX(-50%)' }}>
              {dayMonth(s.startUtc, d * 24)}
            </span>
          ))}
        </div>
        <p className="text-[14px] text-ink-2">Gold: the Sun&apos;s height; blue: Earth&apos;s; dotted while set; grey: the hills in that direction. Time runs left to right.</p>
      </section>
      <section className="flex flex-col gap-1 text-[15px]">
        <h2 className="display text-[18px] font-semibold">The lander</h2>
        <p>
          {landerLine(p)}, starting with the battery {Math.round(p.initialSocFraction * 100)}&nbsp;% full; Earth counts as in view{' '}
          {s.params.minEarthElDeg > 0 ? `when it clears the hills by at least ${s.params.minEarthElDeg}°` : 'whenever it clears the hills'}.
        </p>
        <p>
          {POWER_SCOPE_LINE} {ENERGY_ONLY}
        </p>
      </section>
      <section className="flex flex-col gap-1 text-[15px]">
        <h2 className="display text-[18px] font-semibold">How this was computed</h2>
        {/* The site's setting sits here, not under its name, so the first line is the place and the period; it is text, not a fold, because the brief is printed. */}
        <p>
          Site height {s.maskMeta?.siteHeightM.toFixed(0)} m with a {mast} m mast; {provenance}
          {s.site.approximate ? '; the site is the centre of a region drawn on NASA’s map (about ±5 km)' : ''}. The Sun&apos;s and Earth&apos;s directions come from the JPL DE440 ephemeris (an hourly table, checked against JPL Horizons to 0.00003°).
          {' '}
          {hillsWords(s.site, mast)} Power is the
          panel&apos;s share of 1361 W/m² at the Moon&apos;s distance from the Sun, times the part of the Sun in view; the battery charges with the surplus and empties on the deficit, hour by hour.
          Errors: the directions match JPL Horizons to 0.00003°;{' '}
          {sure.lines.length > 0 ? 'each time above carries its own margin.' : 'the times are hourly, so each change falls in the hour before the one given, and the hills can move them by more (see the Accuracy page).'}
        </p>
        {ground && <p className="text-ink-2">{groundWords(ground)}</p>}
        {cold && <p className="text-ink-2">{cold}</p>}
        {terrain && terrainDetails(terrain) && <p>{terrainDetails(terrain)}</p>}
      </section>
      <section className="flex flex-col gap-1 text-[15px]">
        <h2 className="display text-[18px] font-semibold">Data</h2>
        <ul className="list-disc pl-5">
          <li>NASA LRO LOLA polar elevation models (LDEM 20 m, 80 m and 240 m), PDS Geosciences Node.</li>
          <li>JPL DE440 planetary ephemeris and NAIF SPICE kernels; JPL Horizons for the cross-checks.</li>
          {budget && <li>NASA PGDA product 90 (Barker et al. 2023): the adjusted LOLA south-pole models, their height error and the ground at each site, for the margins.</li>}
          {coldSite?.covered && <li>NASA LRO Diviner Polar Resource Product (Paige et al. 2010) and PGDA product 90&apos;s permanent shadow and slope maps: the modelled cold traps.</li>}
          <li>Site: {s.site.source === 'user' ? 'coordinates picked by the user on the Earthrise map' : s.site.source}.</li>
        </ul>
      </section>
      {/* Where the figures come from and what they take as given, printed with them: every setting, the period in UTC, the
          skyline and its LOLA grids, the ephemeris and its span, the versions, and the link that opens them again. */}
      <section aria-labelledby="brief-provenance" className="flex flex-col gap-2 text-[15px]">
        <h2 id="brief-provenance" className="display text-[18px] font-semibold">
          Settings, sources and versions
        </h2>
        <table className="w-full border-collapse text-left">
          <tbody>
            {provenanceLines(sources).map(([label, value]) => (
              <tr key={label} className="border-t border-line align-top">
                <th scope="row" className="w-[9.5rem] py-1.5 pr-3 font-medium">
                  {label}
                </th>
                <td className="py-1.5 [overflow-wrap:anywhere]">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3 id="brief-assumptions" className="font-semibold">
          What the figures take as given
        </h3>
        <ul aria-labelledby="brief-assumptions" className="list-disc pl-5">
          {sources.assumptions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          Open these figures again in Earthrise: <span className="[overflow-wrap:anywhere]">{shareLink}</span>
        </p>
      </section>
      <section aria-labelledby="brief-downloads" className="no-print flex flex-col gap-2 text-[15px]">
        <h2 id="brief-downloads" className="display text-[18px] font-semibold">
          Download the figures
        </h2>
        <p className="max-w-[52em] text-ink-2">{downloadNote('in the section above')}</p>
        <Downloads input={{ site: s.site, startUtc: s.startUtc, days: s.days, params: s.params, eph: s.eph, series: s.series, power: s.power, summary: s.summary, maskMeta: s.maskMeta, best: s.best }} provenance={sources} link={shareLink} />
      </section>
      <footer className="text-[14px] text-ink-2">
        Generated {new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by Earthrise (NASA Space Apps 2026, team Astroy/Ed).
      </footer>
    </main>
  );
}
