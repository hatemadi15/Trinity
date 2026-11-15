import type { StoreApi } from 'zustand';
import { answerOf, applyActions, describeDropped, validateActions } from '../ai/actions';
import type { PlannerAnswer } from '../ai/client';
import type { ChatSource } from '../ai/protocol';
import { summarizeState, type StateSummary } from '../ai/state-summary';
import { exploreHref, standHref } from '../links';
import { DEFAULT_SITE, type AiMode, type ExploreState } from '../store/explore';
import { plannerLog } from '../store/planner-log';
import { assistSpec } from '../plan/assist';
import { planStore, type PlanState } from '../plan/store';
import type { ScenarioState } from '../store/scenarios';
import type { Control, LunaCommand, Place, PlanStep } from './commands';
import { queueControl, runControl } from './controls';
import { skyAnswer } from './sky';

/** What Luna's commands reach: the app's store and router, the planner, the theme, and Luna herself. */
export interface LunaDeps {
  store: StoreApi<ExploreState>;
  navigate: (href: string) => void;
  /** The page she is on (its path). */
  path: () => string;
  ask: (prompt: string, state: StateSummary | null, mode: AiMode) => Promise<PlannerAnswer>;
  setTheme: (theme: 'light' | 'dark') => void;
  turnOff: () => void;
  /** Whether she says her replies aloud, as the switch in her panel sets it. */
  setVoice: (on: boolean) => void;
  /** The comparison a planner answer may start ("compare with a five-day delay"). */
  scenarios?: StoreApi<ScenarioState>;
  /** The planner's store (spec 23); the app's own by default. */
  plan?: StoreApi<PlanState>;
}

/** What Luna says for each control, when the page says nothing of its own. */
export const REPLIES: Record<Control, string> = {
  play: 'Playing.',
  pause: 'Paused.',
  next: 'Next moment.',
  previous: 'Previous moment.',
  faster: 'Faster.',
  slower: 'Slower.',
  replay: 'From the start.',
  'turn-sun': 'Turning to the Sun.',
  'turn-earth': 'Turning to Earth.',
  'turn-lander': 'Turning to the lander.',
  'look-up': 'Looking up.',
  'look-ahead': 'Looking ahead.',
  'paths-on': 'Paths on.',
  'paths-off': 'Paths off.',
  'words-off': 'Clean view.',
  'words-on': 'The words are back.',
  'brighter-on': 'Brighter picture.',
  'brighter-off': 'Normal brightness.',
  'better-day': 'Landing on the better day.',
  year: 'Every landing day of the next 12 months.',
  fly: 'Flying to the south pole.',
};

const GO_REPLIES: Record<Place, string> = {
  home: 'Home.',
  stand: 'Opening the view from the site.',
  explore: 'Opening the forecast.',
  sites: 'Opening the site list.',
  compare: 'Opening Compare.',
  validate: 'Opening Accuracy.',
  learn: 'Opening How it works.',
  brief: 'Opening the brief.',
};

export const HELP_REPLY =
  'You can ask me to open a page or the view from the site, to play, pause or go to the next moment, to turn to the Sun, Earth or the lander, to show a site, to compare two sites or this one with every other, to plan a landing, or to move the landing, as in "delay the landing by five days".';
const HELLO_REPLY = 'Hello. Tell me what you would like to see: for example, open the view from the site, or play the month.';
/** Her answer to "be quiet": in the conversation only, as her voice is off by then. */
export const MUTE_REPLY = 'Quiet now: my replies show in the chat only. Say "speak again" to hear me.';
/** Her answer to "speak again", said aloud. */
export const UNMUTE_REPLY = 'Saying my replies aloud again.';
const OFFLINE_REPLY = 'I cannot reach the assistant right now. I can still open pages, play the month and turn the view.';

/** The view from the site's controls, and the time bar's: the view from the site has both. */
const AT_THE_SITE = new Set<Control>(['play', 'pause', 'next', 'previous', 'faster', 'slower', 'replay', 'turn-sun', 'turn-earth', 'turn-lander', 'look-up', 'look-ahead', 'paths-on', 'paths-off', 'words-off', 'words-on', 'brighter-on', 'brighter-off']);

/** The address of a place, on the site and period chosen. */
function placeHref(place: Place, s: ExploreState): string {
  const site = s.siteId ?? DEFAULT_SITE;
  if (place === 'home') return '/';
  if (place === 'stand') return standHref(site, s.startUtc, s.days, s.cursorHour);
  if (place === 'explore') return exploreHref(site, s.startUtc, s.days);
  return `/${place}`;
}

/**
 * Applies the planner's actions as the Ask box does (validated against the catalogue again here), logs the exchange
 * there, and shows the result: a new site or period on the view from the site lands the view there; from any page
 * but Explore and Compare, it opens Explore on it.
 */
async function plan(actions: unknown[], reply: string, source: ChatSource, model: string | undefined, prompt: string, deps: LunaDeps): Promise<string> {
  const { store } = deps;
  const before = store.getState();
  const was = `${before.siteId} ${before.startUtc} ${before.days}`;
  const { actions: valid, dropped } = validateActions(actions, new Set(before.sites.map((x) => x.id)));
  let opened = false;
  let notes: string[];
  try {
    notes = await applyActions(
      store,
      valid,
      (href) => {
        opened = true;
        deps.navigate(href);
      },
      deps.scenarios,
      prompt,
    );
  } catch (err) {
    notes = [`One step could not be applied: ${err instanceof Error ? err.message : String(err)}.`];
  }
  const now = store.getState();
  if (!opened && `${now.siteId} ${now.startUtc} ${now.days}` !== was) {
    const at = deps.path();
    if (at.startsWith('/explore/stand')) deps.navigate(placeHref('stand', now));
    else if (at !== '/explore' && at !== '/compare') deps.navigate(placeHref('explore', now));
  }
  const skipped = describeDropped(dropped);
  // A comparison's note is the answer, as on the Ask box: what Compare took, and how the sites rank, are known only once it ran.
  const shown = answerOf(valid, reply, notes);
  const fresh = shown.notes.filter((n) => n.trim() !== shown.reply.trim());
  plannerLog.getState().push({ prompt, reply: shown.reply, source, model, notes: skipped ? [...fresh, skipped] : fresh });
  // A change of period alone is said as the app set it: the phrasing ("delay by five days") and the model know the
  // request, not the new landing, nor a stop at the end of the table or a refusal.
  return valid.length > 0 && valid.every((a) => PERIOD_ACTIONS.has(a.type)) && notes.length > 0 ? notes.join(' ') : shown.reply;
}

/** The actions that only change the period. */
const PERIOD_ACTIONS = new Set<string>(['set_window', 'shift_window', 'find_best_window']);

const PLAN_OPEN = 'Opening the planner. Tell me what the mission needs: how long it needs power, whether Earth must be in view at landing, the longest radio gap, the lander, and when and where to land.';

/** A step of the planner (spec 23), on its page, which she opens when another is showing. */
async function planStep(step: PlanStep, deps: LunaDeps): Promise<string> {
  const plan = deps.plan ?? planStore;
  const s = plan.getState();
  const onPlanner = deps.path().startsWith('/plan');
  const open = () => {
    if (!onPlanner) deps.navigate('/plan');
  };
  switch (step) {
    case 'open':
      open();
      return PLAN_OPEN;
    case 'read':
      return s.status === 'empty' ? 'I have not heard a specification yet. Tell me what the mission needs.' : s.readBack();
    case 'search': {
      if (s.status === 'empty') return 'Tell me what the mission needs first: for example, at least five days of power and Earth in view when we land.';
      open();
      const answer = await s.search();
      if (answer) return plan.getState().summary() ?? answer.headline;
      const now = plan.getState();
      return now.status === 'cancelled' ? 'Search cancelled.' : (now.error ?? 'The search could not run.');
    }
    case 'cancel':
      if (s.status !== 'searching') return 'Nothing is being searched.';
      s.cancel();
      return 'Search cancelled.';
    case 'land':
      if (!s.answer?.shown.length) return s.status === 'empty' ? 'Tell me what the mission needs first, then say search.' : 'There is no landing to plan yet: say search first.';
      return s.land(0, deps.navigate);
    case 'compare':
      if (!s.answer?.shown.length) return 'There is nothing to compare yet: say search first.';
      return s.compareTop(deps.navigate);
  }
}

/** Carries out a command; returns what Luna says, or null when she heard nothing to act on. `said` is what was heard. */
export async function runCommand(cmd: LunaCommand, deps: LunaDeps, said = ''): Promise<string | null> {
  switch (cmd.kind) {
    case 'nothing':
      return null;
    case 'hello':
      return HELLO_REPLY;
    case 'thanks':
      return 'You are welcome.';
    case 'help':
      return HELP_REPLY;
    case 'stop':
      deps.turnOff();
      return 'Luna is off. Press Luna to talk to me again.';
    case 'voice':
      deps.setVoice(cmd.on);
      return cmd.on ? UNMUTE_REPLY : MUTE_REPLY;
    case 'theme':
      deps.setTheme(cmd.theme);
      return cmd.theme === 'dark' ? 'Dark theme.' : 'Light theme.';
    case 'go':
      deps.navigate(placeHref(cmd.place, deps.store.getState()));
      return GO_REPLIES[cmd.place];
    case 'control': {
      const r = runControl(cmd.control);
      if (r.ok) return r.said ?? REPLIES[cmd.control];
      // Not on this page: the view from the site has the turns and the player; the home page has the flight.
      if (AT_THE_SITE.has(cmd.control)) {
        queueControl(cmd.control);
        deps.navigate(placeHref('stand', deps.store.getState()));
        return `${GO_REPLIES.stand} ${REPLIES[cmd.control]}`;
      }
      if (cmd.control === 'year') {
        queueControl('year');
        deps.navigate(placeHref('explore', deps.store.getState()));
        return 'Opening the forecast, with every landing day of the next 12 months.';
      }
      if (cmd.control === 'fly') {
        queueControl('fly');
        deps.navigate('/');
        return 'Going home to fly to the south pole.';
      }
      return 'The better day is on Explore and in the view from the site: open one of them first.';
    }
    case 'sky':
      return skyAnswer(cmd.question, deps.store.getState());
    case 'planner':
      return plan(cmd.actions, cmd.reply, 'intent', undefined, said || cmd.reply, deps);
    case 'plan':
      return planStep(cmd.step, deps);
    case 'spec': {
      const plan = deps.plan ?? planStore;
      const readBack = plan.getState().hear(cmd.text);
      if (!deps.path().startsWith('/plan')) deps.navigate('/plan');
      // The model reads any words the parser could not, on the planner, while she speaks.
      void assistSpec(cmd.text, plan, deps.ask, deps.store.getState().aiMode);
      return readBack;
    }
    case 'ask': {
      const s = deps.store.getState();
      let a: PlannerAnswer;
      try {
        a = await deps.ask(cmd.prompt, summarizeState(s), s.aiMode);
      } catch {
        plannerLog.getState().push({ prompt: said || cmd.prompt, reply: OFFLINE_REPLY, source: 'error', notes: [] });
        return OFFLINE_REPLY;
      }
      return plan(a.actions, a.reply, a.source, a.model, said || cmd.prompt, deps);
    }
  }
}
