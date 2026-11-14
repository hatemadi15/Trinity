import type { Site } from '../data/loaders';
import type { Action } from '../ai/actions';
import { matchIntent } from '../ai/intents';
import { hearSpec } from '../plan/spec';
import { skyQuestion, type SkyQuestion } from './sky';
import { spokenToDigits, tidyDates } from './words';

export { spokenToDigits, tidyDates } from './words';

/**
 * Luna, the voice of the app (spec 22): what she hears, turned into one command. Her own words come first (the
 * player, the view from the site, the pages, the theme, her voice, help); then the planner's phrasings (a site, a
 * comparison, a period, the lander, an explanation), the same the "Ask in plain words" box matches; anything else of
 * three words or more is a question for the model, and a stray word or two is let go, as a room is never quite quiet.
 */

/** A control on a page: the time bar's (play, pause, next, …), the view from the site's (turn to, look up, …), the home page's flight. */
export type Control =
  | 'play'
  | 'pause'
  | 'next'
  | 'previous'
  | 'faster'
  | 'slower'
  | 'replay'
  | 'turn-sun'
  | 'turn-earth'
  | 'turn-lander'
  | 'look-up'
  | 'look-ahead'
  | 'paths-on'
  | 'paths-off'
  | 'words-off'
  | 'words-on'
  | 'brighter-on'
  | 'brighter-off'
  | 'better-day'
  | 'year'
  | 'fly';

/** Where Luna can take you: the app's pages, the view from the site and the home page among them. */
export type Place = 'home' | 'stand' | 'explore' | 'sites' | 'compare' | 'validate' | 'learn' | 'brief';

export type LunaCommand =
  | { kind: 'control'; control: Control }
  | { kind: 'go'; place: Place }
  | { kind: 'theme'; theme: 'light' | 'dark' }
  | { kind: 'help' }
  | { kind: 'stop' }
  | { kind: 'voice'; on: boolean }
  | { kind: 'thanks' }
  | { kind: 'hello' }
  | { kind: 'sky'; question: SkyQuestion }
  | { kind: 'planner'; actions: Action[]; reply: string }
  | { kind: 'ask'; prompt: string }
  | { kind: 'plan'; step: PlanStep }
  | { kind: 'spec'; text: string }
  | { kind: 'nothing' };

/** The planner's steps (spec 23): open it, search, cancel, plan the best landing in Explore, compare the best few, read it back. */
export type PlanStep = 'open' | 'search' | 'cancel' | 'land' | 'compare' | 'read';

/**
 * Her name at the start of what was said, with a greeting before it and a comma after: "Hey Luna, …", "OK Luna. …".
 * Never "lunar", and never the probe Luna 25, a site in the catalogue.
 */
const NAME = /^(?:(?:hey|hi|hello|ok|okay)\s+)?(?:luna|loona|lunah)\b(?!\s*(?:25|twenty[\s-]?five)\b)[\s,.!:;-]*/i;

/** What was said with her name taken off the front, and whether it was there: she was spoken to. */
export function heard(transcript: string): { text: string; addressed: boolean } {
  const t = transcript.trim();
  const m = t.match(NAME);
  return m ? { text: t.slice(m[0].length).trim(), addressed: true } : { text: t, addressed: false };
}

/** How speech often writes the catalogue's harder names, to the names themselves. */
const SPOKEN_NAMES: [RegExp, string][] = [
  [/\b(?:de|the|da|di)\s*gerla(?:che|sh|ch|chee|shay)\b/g, 'de gerlache'],
  [/\bdegerla(?:che|sh|ch)\b/g, 'de gerlache'],
  [/\bnob(?:le|el|ili|eel)\b/g, 'nobile'],
  [/\bmala ?pert\b|\bmalaprop\b/g, 'malapert'],
  [/\bhay ?worth\b|\bhaworth's\b/g, 'haworth'],
  [/\bmons? mutton\b|\bmon mouton\b/g, 'mons mouton'],
  [/\bshackle ?ton\b/g, 'shackleton'],
  [/\bchandra ?y?aa?n\b/g, 'chandrayaan'],
  [/\bchang(?:y|ey|ie|ay)\b/g, "chang'e"],
  [/\b(?:i|eye) (?:m|em) (\d+)\b/g, 'im $1'],
  [/\bs?ch?r(?:o|oe|ö)dinger\b/g, 'schrodinger'],
  [/\brain(?:i?er)? gamma\b/g, 'reiner gamma'],
];

/** Lower case, straight quotes, no closing punctuation, single spaces; "please", "can you" and the like taken off either end. */
function normalize(text: string): string {
  let t = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lead = /^(?:please|can you|could you|would you|will you|i want to|i'd like to|i would like to|let's|let us|now|ok|okay|so|and|then)\s+/;
  while (lead.test(t)) t = t.replace(lead, '');
  t = t.replace(/\s+(?:please|now|for me)$/, '');
  return t;
}

const CONTROLS: [RegExp, Control][] = [
  [/^(?:play|play (?:it|the (?:month|period|days|time|story))|start playing|resume|keep going|continue|carry on|go on|watch the month)$/, 'play'],
  [/^(?:pause|stop|hold(?: on)?|wait(?: a (?:second|sec|moment|minute))?|freeze|stop playing|pause (?:it|the month|playback))$/, 'pause'],
  [/^(?:next|next (?:moment|one|event|step|thing)|skip|skip (?:ahead|forward)|what's next|what is next|go to the next (?:moment|event|one)|forward)$/, 'next'],
  [/^(?:previous|go back|back|back one|previous (?:moment|one|event)|go to the previous (?:moment|event|one)|last moment|the one before)$/, 'previous'],
  [/^(?:faster|go faster|speed up|speed it up|double speed|double the speed|quicker|fast forward|play faster)$/, 'faster'],
  [/^(?:slower|go slower|slow down|slow it down|normal speed|play slower)$/, 'slower'],
  [/^(?:replay|play again|start over|start again|from the (?:beginning|start)|go to the (?:beginning|start)|rewind|restart)$/, 'replay'],
  [/^(?:(?:turn|look|point) (?:to|at|towards?) (?:the )?sun|face (?:the )?sun|show me the sun|where's the sun|where is the sun|find the sun)$/, 'turn-sun'],
  [/^(?:(?:turn|look|point) (?:to|at|towards?) (?:the )?earth|face (?:the )?earth|show me (?:the )?earth|where's (?:the )?earth|where is (?:the )?earth|find (?:the )?earth)$/, 'turn-earth'],
  [/^(?:(?:turn|look|point) (?:to|at|towards?) (?:the )?lander|face (?:the )?lander|show me the lander|where's the lander|where is the lander|find the lander)$/, 'turn-lander'],
  [/^(?:look up|look at the (?:sky|stars)|show me the (?:sky|stars)|the stars)$/, 'look-up'],
  [/^(?:look ahead|look down|look back down|back to the horizon|look at the horizon)$/, 'look-ahead'],
  [/^(?:show (?:me )?(?:the )?paths|paths on|turn on (?:the )?paths)$/, 'paths-on'],
  [/^(?:hide (?:the )?paths|paths off|turn off (?:the )?paths|no paths)$/, 'paths-off'],
  [/^(?:hide (?:the )?words|clean view|no words|remove the words|classroom view)$/, 'words-off'],
  [/^(?:show (?:the )?words|words on|bring back the words|bring the words back)$/, 'words-on'],
  [/^(?:brighter|brighter picture|make it brighter|brighten(?: it)?(?: up)?|it's too dark|too dark|turn on brighter picture)$/, 'brighter-on'],
  [/^(?:normal brightness|less bright|darker|dimmer|turn off brighter picture)$/, 'brighter-off'],
  [/^(?:(?:land on|try|use|switch to|go to) (?:the )?better (?:day|date)(?: instead)?|(?:the )?better (?:day|date))$/, 'better-day'],
  [/^(?:(?:show (?:me )?)?(?:the )?(?:whole )?year(?: at a glance)?|(?:show (?:me )?)?(?:every|all(?: the)?) landing days?)$/, 'year'],
  [/^(?:fly to the (?:south )?pole|fly (?:me )?to the south pole|take off|start the flight|fly)$/, 'fly'],
];

const PLACES: [RegExp, Place][] = [
  [
    /^(?:(?:open|show|go to|take me to|switch to) (?:the )?(?:stand|standing) view|(?:the )?stand view|stand at the site|stand on the moon|stand there|go to the site|(?:show me |go to |open )?the view from the (?:site|ground|surface)|(?:take me to|go to|put me on) the (?:surface|ground)|land|land there|land here|land on the moon|(?:open |show )?(?:the )?3d view|immersive view)$/,
    'stand',
  ],
  [/^(?:(?:go )?home|home page|(?:go to|open|back to) the (?:home|start|front|main) page|start page|main page|back to the start|go back home)$/, 'home'],
  [/^(?:explore|open explore|go to explore|(?:open |show |see )?(?:the )?(?:full )?forecast|open the full forecast)$/, 'explore'],
  [/^(?:choose a site|pick a site|all sites|all the sites|(?:open |show |go to )?the site list|list (?:the |all )?sites|landing sites|sites)$/, 'sites'],
  [/^(?:compare sites|compare|(?:open|go to|show) compare|(?:open|go to|show) (?:the )?comparison)$/, 'compare'],
  [/^(?:accuracy|(?:open|go to|show) (?:the )?accuracy(?: page)?|(?:show me |open )?the checks|how accurate is (?:this|it)|validation)$/, 'validate'],
  [/^(?:how it works|(?:open|go to|show) how it works|learn|(?:open|go to) learn)$/, 'learn'],
  [/^(?:(?:the |open the |show the |go to the )?(?:printable |mission )?brief|print(?: it)?|print the brief)$/, 'brief'],
];

const THEME: [RegExp, 'light' | 'dark'][] = [
  [/^(?:dark mode|dark theme|(?:switch|change|go) to dark(?: mode| theme)?|go dark|night mode)$/, 'dark'],
  [/^(?:light mode|light theme|(?:switch|change|go) to light(?: mode| theme)?|go light|day mode)$/, 'light'],
];

const HELP = /^(?:help|help me|what can you do|what can i say|what can i ask|what do you do|how do i use (?:this|you)|commands)$/;
const STOP = /^(?:stop listening|goodbye|good bye|bye|bye bye|turn off|turn yourself off|switch off|go to sleep|sleep|that's all|that is all|luna off|stop luna)$/;
/** Her voice off and on again, as the switch in her panel turns it: she keeps listening either way. */
const MUTE = /^(?:be quiet|keep quiet|mute|mute yourself|stop (?:talking|speaking)|(?:turn|switch) off (?:your|the) voice|voice off)$/;
const UNMUTE = /^(?:unmute|unmute yourself|speak again|talk again|you can (?:speak|talk) again|(?:turn|switch) on (?:your|the) voice|voice on)$/;
const THANKS = /^(?:thank you|thanks|thank you very much|thanks a lot|cheers)$/;
const HELLO = /^(?:hello|hi|hey|hello there|hi there|good (?:morning|afternoon|evening))$/;

const PLAN: [RegExp, PlanStep][] = [
  [/^(?:plan (?:a |my |our )?(?:landing|mission)|(?:open|go to|show(?: me)?) (?:the )?(?:mission )?planner|(?:the )?(?:mission )?planner|help me plan (?:a |the )?(?:landing|mission)|find (?:me )?(?:the )?best (?:landing )?sites? for (?:my|a|our|the) mission)$/, 'open'],
  [/^(?:search|start (?:the )?search|run (?:the )?search|search now|start searching|go ahead|yes search|find (?:them|it|the best sites?))$/, 'search'],
  [/^(?:cancel(?: the search| it| that)?|stop (?:the )?search(?:ing)?)$/, 'cancel'],
  [/^(?:plan (?:this|that|the|the first|the best|the top) landing|(?:use|choose|take|pick) (?:this|that|the first|the best|the top) (?:one|site|landing))$/, 'land'],
  [/^(?:compare (?:them|these|those|the results|these sites|the (?:best|top) (?:sites|ones|results))|open (?:them|these) in compare)$/, 'compare'],
  [/^(?:read (?:it|that|the specification|the spec)(?: back)?|what did you hear|repeat (?:that|it))$/, 'read'],
];

/**
 * What Luna does with what she heard: her own command, the planner's, a question for the model, or nothing. On the
 * planner (`planning`), words that give any field of a mission's specification are the specification; elsewhere it
 * takes two fields or more, so a single setting still goes to Explore's lander as before.
 */
export function parseCommand(transcript: string, sites: Site[], context: { planning?: boolean } = {}): LunaCommand {
  const { text: said, addressed } = heard(transcript);
  const t = normalize(said);
  // Her name alone is a greeting: she answers.
  if (!t) return addressed ? { kind: 'hello' } : { kind: 'nothing' };
  if (STOP.test(t)) return { kind: 'stop' };
  if (MUTE.test(t)) return { kind: 'voice', on: false };
  if (UNMUTE.test(t)) return { kind: 'voice', on: true };
  if (THANKS.test(t)) return { kind: 'thanks' };
  if (HELLO.test(t)) return { kind: 'hello' };
  if (HELP.test(t)) return { kind: 'help' };
  for (const [re, theme] of THEME) if (re.test(t)) return { kind: 'theme', theme };
  for (const [re, control] of CONTROLS) if (re.test(t)) return { kind: 'control', control };
  for (const [re, place] of PLACES) if (re.test(t)) return { kind: 'go', place };
  for (const [re, step] of PLAN) if (re.test(t)) return { kind: 'plan', step };
  let planned = tidyDates(spokenToDigits(t));
  for (const [re, name] of SPOKEN_NAMES) planned = planned.replace(re, name);
  const fields = Object.keys(hearSpec(planned, sites).patch).length;
  if (context.planning && fields >= 1) return { kind: 'spec', text: planned };
  // A question on the sky at the time bar's hour, answered from the pages' own countdown and radio windows.
  const sky = skyQuestion(t);
  if (sky) return { kind: 'sky', question: sky };
  const r = matchIntent(planned, sites);
  if (r) return { kind: 'planner', actions: r.actions, reply: r.reply };
  if (fields >= 2) return { kind: 'spec', text: planned };
  // A question for the model: three words or more, in the words said (the figures as spoken, the name taken off).
  if (t.split(' ').length >= 3) return { kind: 'ask', prompt: said.replace(/\s+/g, ' ').trim() };
  return { kind: 'nothing' };
}
