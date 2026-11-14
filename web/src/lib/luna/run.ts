import type { StoreApi } from 'zustand';
import { applyActions, describeDropped, validateActions } from '../ai/actions';
import type { PlannerAnswer } from '../ai/client';
import type { ChatSource } from '../ai/protocol';
import { summarizeState, type StateSummary } from '../ai/state-summary';
import { exploreHref, standHref } from '../links';
import { DEFAULT_SITE, type AiMode, type ExploreState } from '../store/explore';
import { plannerLog } from '../store/planner-log';
import type { Control, LunaCommand, Place } from './commands';
import { queueControl, runControl } from './controls';

/** What Luna's commands reach: the app's store and router, the planner, the theme, and Luna herself. */
export interface LunaDeps {
  store: StoreApi<ExploreState>;
  navigate: (href: string) => void;
  /** The page she is on (its path). */
  path: () => string;
  ask: (prompt: string, state: StateSummary | null, mode: AiMode) => Promise<PlannerAnswer>;
  setTheme: (theme: 'light' | 'dark') => void;
  turnOff: () => void;
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
  'You can ask me to open a page or the view from the site, to play, pause or go to the next moment, to turn to the Sun, Earth or the lander, to show a site, or to compare two sites.';
const HELLO_REPLY = 'Hello. Tell me what you would like to see: for example, open the view from the site, or play the month.';
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
    notes = await applyActions(store, valid, (href) => {
      opened = true;
      deps.navigate(href);
    });
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
  const fresh = notes.filter((n) => n.trim() !== reply.trim());
  plannerLog.getState().push({ prompt, reply, source, model, notes: skipped ? [...fresh, skipped] : fresh });
  return reply;
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
    case 'planner':
      return plan(cmd.actions, cmd.reply, 'intent', undefined, said || cmd.reply, deps);
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
