'use client';
import { useEffect, useState } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { AppFrame } from '@/components/AppFrame';
import { DataProblem, SYNC_HINT } from '@/components/DataProblem';
import { Fold } from '@/components/Fold';
import { ENERGY_ONLY } from '@/components/PowerScope';
import { PRIORITY_CHOICES, PriorityBoxes } from '@/components/explore/PlanParts';
import { askPlanner } from '@/lib/ai/client';
import { pointKind } from '@/lib/data/kind';
import { siteLabel, type Site } from '@/lib/data/loaders';
import type { Ephemeris } from '@/lib/engine/ephemeris';
import { hourlySeries } from '@/lib/engine/metrics';
import { powerBudget } from '@/lib/engine/power';
import { utcToEt } from '@/lib/engine/time';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { assistSpec } from '@/lib/plan/assist';
import { midSentence } from '@/lib/plan/judge';
import { partsWords, profileOf, weighedScore } from '@/lib/plan/rank';
import { bucketKind, bucketsOf, planRuleWords, powerOf, type SiteFinding, type SiteInput } from '@/lib/plan/search';
import { CATEGORY_NAMES, PANEL_SHORT, PANELS, specLines, whereSites, windowWords, type MissionSpec, type SpecField, type SpecPatch, type Sources } from '@/lib/plan/spec';
import { planStore, type PlanState } from '@/lib/plan/store';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { sureLines, type UncertaintyDoc } from '@/lib/uncertainty/budget';
import { useUncertainty } from '@/lib/uncertainty/useUncertainty';
import { dateTimeUtc, spanShort } from '@/lib/viz/format';
import { terrainLimitation } from '@/lib/viz/terrain';

/** The example the page offers, the one the brief gives. */
export const EXAMPLE_SPEC =
  'We need at least five days of power, Earth in view when we land, no radio gap longer than three days, a 300 watt load and a 3 kilowatt-hour battery, landing between March and June 2027, near the Artemis III regions.';

const LABEL = 'flex flex-col gap-1.5 text-[15px] text-ink-2';
const TAG = 'ml-1 text-[14px] text-ink-3';

/** A number box for a field that may be unset (an empty box: no requirement), its value shown in `unit`s. */
function FieldNumber({ label, value, unit, step, min = 0, max, said, onChange, optional = false }: { label: string; value: number | null; unit: number; step: number; min?: number; max: number; said: boolean; onChange: (v: number | null) => void; optional?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = value === null ? '' : String(Math.round((value / unit) * 100) / 100);
  return (
    <label className={LABEL}>
      <span>
        {label}
        {!said && <span className={TAG}>default</span>}
      </span>
      <input
        type="number"
        value={draft ?? shown}
        min={min}
        max={max}
        step={step}
        placeholder={optional ? 'none' : undefined}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          if (raw === '' && optional) onChange(null);
          else if (raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= min && Number(raw) <= max) onChange(Number(raw) * unit);
        }}
        onBlur={() => setDraft(null)}
        className="field w-full min-w-0"
      />
    </label>
  );
}

/** The day a window's end means: the last day landing may happen, for a date box. */
const lastDay = (toUtc: string) => new Date(Date.parse(`${toUtc}Z`) - 86_400_000).toISOString().slice(0, 10);

/** The heard specification as fields to check and change; a change counts as said. The rarer ones fold. */
function SpecFields({ spec, from, sites, onEdit }: { spec: MissionSpec; from: Sources; sites: Site[]; onEdit: (p: SpecPatch) => void }) {
  const [own, setOwn] = useState(false);
  const said = (...f: SpecField[]) => f.some((x) => from[x]);
  // The ranking's choice: one of the plain objectives, or the priorities by name or as weights of one's own.
  const named = profileOf(spec.priorities);
  const rankValue = spec.objective !== 'weighed' ? spec.objective : own || named === 'custom' ? 'weighed:custom' : `weighed:${named}`;
  const categories = [...new Set(sites.map((s) => s.category))].filter((c) => CATEGORY_NAMES[c]);
  const whereValue = spec.where.kind === 'category' ? `category:${spec.where.category}` : spec.where.kind === 'near' ? 'near' : spec.where.kind;
  const nearId = spec.where.kind === 'near' ? spec.where.id : spec.where.kind === 'sites' ? spec.where.ids[0] : 'shackleton_center';
  const nearKm = spec.where.kind === 'near' ? spec.where.km : 50;
  const GRID = 'mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4';
  const tag = (...f: SpecField[]) => !said(...f) && <span className={TAG}>default</span>;
  return (
    <>
      <div className={GRID}>
        <FieldNumber label="Power from landing, days" value={spec.req.minPoweredH} unit={24} step={0.5} max={90} said={said('minPoweredH')} optional onChange={(v) => onEdit({ minPoweredH: v })} />
        <FieldNumber label="Earth in view by, hours after landing" value={spec.req.contactWithinH} unit={1} step={1} max={2160} said={said('contactWithinH')} optional onChange={(v) => onEdit({ contactWithinH: v })} />
        <FieldNumber label="Longest without Earth while powered, days" value={spec.req.maxOutageH} unit={24} step={0.5} max={90} said={said('maxOutageH')} optional onChange={(v) => onEdit({ maxOutageH: v })} />
        <FieldNumber label="Load, W" value={spec.lander.loadW} unit={1} step={10} min={10} max={2000} said={said('loadW')} onChange={(v) => onEdit({ loadW: v! })} />
        <FieldNumber label="Battery, kWh" value={spec.lander.batteryWh} unit={1000} step={0.1} min={0.1} max={50} said={said('batteryWh')} onChange={(v) => onEdit({ batteryWh: v! })} />
        <label className={LABEL}>
          <span>Land from, UTC{tag('fromUtc')}</span>
          <input type="date" value={spec.fromUtc.slice(0, 10)} min="2024-01-02" max="2036-12-01" onChange={(e) => e.target.value && onEdit({ fromUtc: `${e.target.value}T00:00:00` })} className="field w-full min-w-0" />
        </label>
        <label className={LABEL}>
          <span>Land by, UTC{tag('toUtc')}</span>
          <input
            type="date"
            value={lastDay(spec.toUtc)}
            min="2024-01-02"
            max="2036-12-01"
            onChange={(e) => e.target.value && onEdit({ toUtc: new Date(Date.parse(`${e.target.value}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 19) })}
            className="field w-full min-w-0"
          />
        </label>
        <label className={LABEL}>
          <span>Where{tag('where')}</span>
          <select
            value={whereValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'all') onEdit({ where: { kind: 'all' } });
              else if (v === 'near') onEdit({ where: { kind: 'near', id: nearId, km: nearKm } });
              else if (v.startsWith('category:')) onEdit({ where: { kind: 'category', category: v.slice(9) } });
            }}
            className="field w-full min-w-0"
          >
            <option value="all">Every catalogue site</option>
            {categories.map((c) => (
              <option key={c} value={`category:${c}`}>
                {CATEGORY_NAMES[c].replace(/^the /, '').replace(/^./, (x) => x.toUpperCase())}
              </option>
            ))}
            <option value="near">Near one site</option>
            {spec.where.kind === 'sites' && <option value="sites">The sites named</option>}
          </select>
        </label>
        {spec.where.kind === 'near' && (
          <>
            <label className={LABEL}>
              <span>Near</span>
              <select value={nearId} onChange={(e) => onEdit({ where: { kind: 'near', id: e.target.value, km: nearKm } })} className="field w-full min-w-0">
                {sites
                  .filter((s) => s.category !== 'custom')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {siteLabel(s)}
                    </option>
                  ))}
              </select>
            </label>
            <FieldNumber label="Within, km" value={nearKm} unit={1} step={5} min={1} max={2000} said onChange={(v) => onEdit({ where: { kind: 'near', id: nearId, km: v! } })} />
          </>
        )}
      </div>
      <Fold label="More settings" className="mt-4">
        <div className={GRID}>
          <FieldNumber label="Earth contact while powered, hours" value={spec.req.minPoweredContactH} unit={1} step={1} max={2160} said={said('minPoweredContactH')} optional onChange={(v) => onEdit({ minPoweredContactH: v })} />
          <FieldNumber label="Stay, days" value={spec.stayH} unit={24} step={1} min={1} max={90} said={said('stayH')} onChange={(v) => onEdit({ stayH: v! })} />
          <FieldNumber label="Panel, m²" value={spec.lander.areaM2} unit={1} step={0.5} min={0.5} max={50} said={said('areaM2')} onChange={(v) => onEdit({ areaM2: v! })} />
          <label className={LABEL}>
            <span>Panel kind{tag('panel')}</span>
            <select value={spec.lander.panel} onChange={(e) => onEdit({ panel: e.target.value as MissionSpec['lander']['panel'] })} className="field w-full min-w-0">
              {PANELS.map((p) => (
                <option key={p} value={p}>
                  {PANEL_SHORT[p]}
                </option>
              ))}
            </select>
          </label>
          <FieldNumber label="Mast, m" value={spec.lander.mastM} unit={1} step={1} max={10} said={said('mastM')} onChange={(v) => onEdit({ mastM: v! })} />
          <label className={LABEL}>
            <span>Try landing every{tag('stepH')}</span>
            <select value={spec.stepH} onChange={(e) => onEdit({ stepH: Number(e.target.value) })} className="field w-full min-w-0">
              {[1, 2, 3, 6, 12].map((h) => (
                <option key={h} value={h}>
                  {h === 1 ? 'hour' : `${h} hours`}
                </option>
              ))}
            </select>
          </label>
          <label className={LABEL}>
            <span>Then rank by{tag('objective')}</span>
            <select
              value={rankValue}
              onChange={(e) => {
                const v = e.target.value;
                setOwn(v === 'weighed:custom');
                if (v === 'weighed:custom') onEdit({ objective: 'weighed' });
                else if (v.startsWith('weighed:')) {
                  const p = PRIORITY_CHOICES.find((c) => c.value === v);
                  if (p) onEdit({ objective: 'weighed', priorities: { ...p.priorities } });
                } else onEdit({ objective: v as MissionSpec['objective'] });
              }}
              className="field w-full min-w-0"
            >
              <option value="power">Longest time with power</option>
              <option value="contact">Most Earth contact while powered</option>
              <option value="earliest">Earliest landing</option>
              {PRIORITY_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
              <option value="weighed:custom">Priorities: your own weights</option>
            </select>
          </label>
        </div>
        {rankValue === 'weighed:custom' && (
          <div className="mt-4 max-w-[30em]">
            <PriorityBoxes value={spec.priorities} onChange={(priorities) => onEdit({ objective: 'weighed', priorities })} />
          </div>
        )}
      </Fold>
    </>
  );
}

/** What a result can and cannot say: the measured margins, the skyline it was searched with, energy only. */
function Limits({ f, spec, input, eph, doc }: { f: SiteFinding; spec: MissionSpec; input: SiteInput | undefined; eph: Ephemeris | null; doc: UncertaintyDoc | null }) {
  let sure: ReturnType<typeof sureLines> | null = null;
  if (f.best && input && eph && doc) {
    try {
      const series = hourlySeries(f.site, input.mask, eph, utcToEt(f.best.item.utc), spec.stayH);
      sure = sureLines({ doc, site: f.site, series, power: powerBudget(series, powerOf(spec)), startUtc: f.best.item.utc });
    } catch {
      sure = null;
    }
  }
  const sky = f.skyline;
  return (
    <div className="flex flex-col gap-2 text-[15px] text-ink-2">
      {sure && sure.widest !== null ? (
        <p>
          Times of the stay’s key moments are within about {sure.widest < 1 ? `${Math.round(sure.widest * 60)} min` : `${sure.widest} h`}. {sure.basis}
        </p>
      ) : (
        <p>The measured margins of the times are on the Accuracy page.</p>
      )}
      <p>
        {sky.source === 'flat'
          ? 'A flat horizon is assumed: the site lies outside the polar terrain grids.'
          : `Skyline from NASA LOLA heights, seen from a ${sky.mastM} m mast.${sky.mastM !== spec.lander.mastM ? ` The search used it for your ${spec.lander.mastM} m mast, as tracing every site from that height would take minutes; Explore traces the ${spec.lander.mastM} m mast when you plan this landing.` : ''}`}
      </p>
      {terrainLimitation(sky.terrain) && sky.source !== 'flat' && <p className="text-ink">{terrainLimitation(sky.terrain)}</p>}
      <p>{pointKind(f.site).sentence}</p>
      {f.site.far_side && <p>On the far side Earth never rises: no direct radio contact with Earth.</p>}
      <p>{ENERGY_ONLY}</p>
    </div>
  );
}

/** One result: where and when it lands, its figures, the requirements it meets or fails and by how much, why it ranks above the next. */
function Result({ f, i, why, spec, input, eph, doc, onLand }: { f: SiteFinding; i: number; why: string | null; spec: MissionSpec; input: SiteInput | undefined; eph: Ephemeris | null; doc: UncertaintyDoc | null; onLand: () => void }) {
  const b = f.best!;
  const o = b.outcome;
  const name = `${i + 1}. ${siteLabel(f.site)}`;
  return (
    <li aria-label={name} className="border-t border-line pt-4">
      <h3 className="text-[19px] font-semibold">{name}</h3>
      <p className="mt-1 text-ink">Lands {dateTimeUtc(b.item.utc, 0)}</p>
      {b.checks.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[15px]">
          {b.checks.map((c) => (
            <li key={c.id} className={c.met ? 'text-good' : 'text-bad'}>
              {c.met ? 'Meets' : 'Fails'}: {c.words}
            </li>
          ))}
        </ul>
      )}
      {why && <p className="mt-2 text-[15px] text-ink">{why}</p>}
      <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-2">
        <button type="button" onClick={onLand} aria-label={`Plan this landing: ${siteLabel(f.site)}`} className="btn">
          Plan this landing
        </button>
        <Fold label="How sure is this">
          <p className="mb-2 text-[15px] text-ink-2">
            Power {spanShort(o.poweredH)} of the {spanShort(o.stayH)} stay; Earth contact while powered {spanShort(o.poweredContactH)}; longest without Earth while powered {spanShort(o.poweredOutageH)}; sunlight {spanShort(o.sunH)}. {f.meeting} of the {f.sunlit} daylight landing times tried here meet every
            requirement.
          </p>
          <Limits f={f} spec={spec} input={input} eph={eph} doc={doc} />
        </Fold>
      </div>
    </li>
  );
}

/**
 * The dates at a glance: the best landing in each month of the window (each week of a short one) at the first three
 * sites shown, as the time with power from landing and whether it meets every requirement, each opening that landing in
 * Explore. It shows what the year view of one site does not: several sites against the dates.
 */
function DatesGlance({ shown, spec, requirements, onLand }: { shown: SiteFinding[]; spec: MissionSpec; requirements: number; onLand: (index: number, utc: string) => void }) {
  const buckets = bucketsOf(spec);
  const sites = shown.slice(0, 3);
  const each = bucketKind(spec);
  const weeks = each === 'week';
  return (
    <table className="w-full border-collapse text-left text-[14px] sm:max-w-[48em]">
      <caption className="mb-2 text-left text-[15px] text-ink-2">
        The best landing in each {each} of the window by the ranking above, at {sites.length === 1 ? 'the first site' : `the first ${sites.length} sites`}: its time with power from landing{requirements > 0 ? '; ✓ meets every requirement' : ''}. Each opens that landing in Explore.
      </caption>
      <thead>
        <tr>
          <th scope="col" className="py-1 pr-2 font-medium text-ink-2">
            {weeks ? 'Week of' : 'Month'}
          </th>
          {sites.map((f) => (
            <th key={f.site.id} scope="col" className="px-1 py-1 font-medium text-ink">
              {siteLabel(f.site)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {buckets.map((b, k) => (
          <tr key={b.fromHour} className="border-t border-line">
            <th scope="row" className="whitespace-nowrap py-1 pr-2 font-normal text-ink-2">
              {b.label}
            </th>
            {sites.map((f, i) => {
              const o = f.byDate?.[k] ?? null;
              if (!o) return <td key={f.site.id} className="px-1 py-1 text-ink-3">no sunlit landing</td>;
              const meets = requirements > 0 && o.failed === 0;
              return (
                <td key={f.site.id} className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => onLand(i, o.item.utc)}
                    aria-label={`Plan this landing: ${siteLabel(f.site)}, ${dateTimeUtc(o.item.utc, 0)}${meets ? ', meets every requirement' : ''}`}
                    className={`min-h-10 whitespace-nowrap text-left tabular-nums underline decoration-line-strong underline-offset-4 hover:decoration-ink ${meets ? 'text-good' : 'text-ink'}`}
                  >
                    {meets && <span aria-hidden="true">✓ </span>}
                    {spanShort(o.outcome.poweredH)}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The planner (spec 23): say or type what the mission needs, see it read back as fields to check and change, search every
 * allowed site and landing time, and read the ranked answer with its reasons and limits; then plan the chosen landing in
 * Explore, or compare the best few. The search runs off the main thread with progress and a cancel.
 */
export function PlanView({
  store = exploreStore,
  plan = planStore,
  navigate,
  ask = askPlanner,
  uncertainty,
}: {
  store?: StoreApi<ExploreState>;
  plan?: StoreApi<PlanState>;
  navigate?: (href: string) => void;
  ask?: Parameters<typeof assistSpec>[2];
  uncertainty?: () => Promise<UncertaintyDoc>;
}) {
  const status = useStore(store, (s) => s.status);
  const error = useStore(store, (s) => s.error);
  const sites = useStore(store, (s) => s.sites);
  const eph = useStore(store, (s) => s.eph);
  const aiMode = useStore(store, (s) => s.aiMode);
  const p = useStore(plan);
  const doc = useUncertainty(uncertainty);
  const routerNavigate = useNavigate();
  const go = navigate ?? routerNavigate;
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    void store.getState().init();
  }, [store]);

  const read = (words: string) => {
    const t = words.trim();
    if (!t) return;
    plan.getState().hear(t);
    setNote(null);
    void assistSpec(t, plan, ask, store.getState().aiMode).then((n) => n && setNote(n));
  };

  if (status === 'error') {
    return (
      <AppFrame>
        <main className="wrap py-12">
          <DataProblem error={error} hint={SYNC_HINT} />
        </main>
      </AppFrame>
    );
  }

  const heard = p.status !== 'empty';
  const count = whereSites(p.spec.where, sites).length;
  const all = specLines(p.spec, p.from, sites);
  const lines = all.filter((l) => !l.isDefault);
  const defaults = all.filter((l) => l.isDefault);
  const searching = p.status === 'searching';
  const searched = p.searched;
  return (
    <AppFrame>
      <main className="wrap flex flex-col gap-6 pb-12 pt-8">
        <div>
          <h1 data-band-end="" className="display text-[34px] leading-tight sm:text-[40px]">
            Plan a landing
          </h1>
          <p className="mt-2 max-w-[46em] text-lg text-ink-2">Say or type what the mission needs. The planner tries every site and landing time you allow, and ranks them.</p>
        </div>
        <form
          aria-label="The mission’s specification"
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            read(text);
          }}
        >
          <label htmlFor="plan-words" className="text-[15px] text-ink-2">
            What does the mission need?
          </label>
          <textarea id="plan-words" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder="For example: at least five days of power, Earth in view when we land, landing between March and June 2027." className="field h-auto w-full py-3 placeholder:text-ink-3" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn">
              Read it
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setText(EXAMPLE_SPEC);
                read(EXAMPLE_SPEC);
              }}
            >
              Try the example
            </button>
            <p className="text-[15px] text-ink-2">Or press Luna and say it.</p>
          </div>
        </form>

        {heard && (
          <section aria-label="I heard" className="panel">
            <h2 className="display text-[23px] font-semibold">I heard</h2>
            <p className="mt-2 max-w-[60em] text-ink">{lines.length ? lines.map((l) => `${l.label}: ${l.value}`).join('; ') : 'No field yet: everything below is the default.'}.</p>
            {defaults.length > 0 && <p className="mt-2 text-[15px] text-ink-2">Defaults: {defaults.map((l) => `${midSentence(l.label)} ${l.value}`).join('; ')}.</p>}
            {p.leftover.length > 0 && <p className="mt-2 text-[15px] text-ink-2">Not used: {p.leftover.map((l) => `“${l}”`).join(', ')}.</p>}
            {p.assistant.state === 'asking' && (
              <p role="status" className="mt-2 text-[15px] text-ink-2">
                Asking the assistant about the words not used…
              </p>
            )}
            {note && <p className="mt-2 text-[15px] text-ink-2">{note} Check those fields.</p>}
            {p.assistant.state === 'failed' && aiMode !== 'cached' && <p className="mt-2 text-[15px] text-ink-2">The assistant did not add a field: the fields are the app’s own reading.</p>}
            {[...p.notes, ...p.problems].map((n) => (
              <p key={n} className={`mt-2 text-[15px] ${p.problems.includes(n) ? 'text-bad' : 'text-ink-2'}`}>
                {n}
              </p>
            ))}
            <SpecFields spec={p.spec} from={p.from} sites={sites} onEdit={(patch) => plan.getState().edit(patch)} />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void plan.getState().search()} disabled={searching || p.problems.length > 0 || count === 0 || !eph} className="btn btn-primary">
                Search {count} site{count === 1 ? '' : 's'}
              </button>
              {searching && (
                <>
                  <p role="status" className="text-[15px] text-ink-2">
                    Searching: {p.progress?.done ?? 0} of {p.progress?.total ?? count} sites…
                  </p>
                  <button type="button" onClick={() => plan.getState().cancel()} className="btn">
                    Cancel
                  </button>
                </>
              )}
              {p.status === 'cancelled' && <p className="text-[15px] text-ink-2">Search cancelled.</p>}
              {p.status === 'error' && p.error && <p className="text-[15px] text-bad">{p.error}</p>}
            </div>
            {/* Before an answer, the search's scope; after it, the answer's own scope line says it. */}
            {!p.answer && (
              <p className="mt-2 text-[15px] text-ink-2">
                Landing times every {p.spec.stepH === 1 ? 'hour' : `${p.spec.stepH} hours`}, {windowWords(p.spec)}.
              </p>
            )}
          </section>
        )}

        {p.answer && searched && p.stats && (
          <section aria-label="The answer" className="panel">
            <h2 className="display text-[23px] font-semibold">The answer</h2>
            <p className="mt-2 max-w-[60em] text-[17px] text-ink">{p.answer.headline}</p>
            {p.answer.shown.length > 0 && (
              <ol className="mt-4 flex flex-col gap-4">
                {p.answer.shown.map((f, i) => (
                  <Result
                    key={f.site.id}
                    f={f}
                    i={i}
                    why={p.answer!.why[i]}
                    spec={searched}
                    input={p.inputs[f.site.id]}
                    eph={eph}
                    doc={doc}
                    onLand={() => void plan.getState().land(i, go)}
                  />
                ))}
              </ol>
            )}
            {p.answer.shown.length > 0 && (
              <p className="mt-4">
                <button type="button" onClick={() => void plan.getState().compareTop(go)} className="btn">
                  Compare these sites
                </button>
              </p>
            )}
            <Fold label="Ranking and dates" className="mt-3">
              <p className="max-w-[60em] text-[15px] text-ink-2">{planRuleWords(searched, p.answer.requirements)}</p>
              {searched.objective === 'weighed' && p.answer.shown.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 text-[15px] text-ink-2">
                  {p.answer.shown.map((f, i) => {
                    const sc = weighedScore(f.best!.outcome, searched.priorities);
                    return (
                      <li key={f.site.id}>
                        {i + 1}. {siteLabel(f.site)} scores {sc.score.toFixed(1)} of 100: {partsWords(sc)}.
                      </li>
                    );
                  })}
                </ul>
              )}
              {p.answer.shown.length > 0 && (
                <div className="mt-4">
                  <DatesGlance shown={p.answer.shown} spec={searched} requirements={p.answer.requirements} onLand={(i, utc) => void plan.getState().land(i, go, utc)} />
                </div>
              )}
            </Fold>
            <p className="mt-4 max-w-[60em] text-[15px] text-ink-2">
              Best among the {p.stats.sites} sites and {p.stats.landingTimes.toLocaleString('en-GB')} landing times tried ({p.stats.stepH === 1 ? 'every hour' : `every ${p.stats.stepH} hours`}, {windowWords(searched)}), for this lander and a{' '}
              {spanShort(searched.stayH)} stay, in {(p.stats.ms / 1000).toFixed(1)} s.
              {p.stats.coarsened && ` Landing times were tried every ${p.stats.stepH} hours to keep the search to seconds.`}
              {p.skipped.length > 0 && ` Left out, as their skyline could not be loaded: ${p.skipped.join(', ')}.`}
            </p>
          </section>
        )}
      </main>
    </AppFrame>
  );
}
