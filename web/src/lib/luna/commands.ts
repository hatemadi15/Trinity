import type { Site } from '../data/loaders';
import type { Action } from '../ai/actions';
import { matchIntent } from '../ai/intents';

/**
 * Luna, the voice of the app (spec 22): what she hears, turned into one command. Her own words come first (the
 * player, the view from the site, the pages, the theme, help); then the planner's phrasings (a site, a comparison, a
 * period, the lander, an explanation), the same the "Ask in plain words" box matches; anything else of three words or
 * more is a question for the model, and a stray word or two is let go, as a room is never quite quiet.
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
  | 'fly';

/** Where Luna can take you: the app's pages, the view from the site and the home page among them. */
export type Place = 'home' | 'stand' | 'explore' | 'sites' | 'compare' | 'validate' | 'learn' | 'brief';

export type LunaCommand =
  | { kind: 'control'; control: Control }
  | { kind: 'go'; place: Place }
  | { kind: 'theme'; theme: 'light' | 'dark' }
  | { kind: 'help' }
  | { kind: 'stop' }
  | { kind: 'thanks' }
  | { kind: 'hello' }
  | { kind: 'planner'; actions: Action[]; reply: string }
  | { kind: 'ask'; prompt: string }
  | { kind: 'nothing' };

/** Her name at the start of what was said, with a greeting before it and a comma after: "Hey Luna, …", "OK Luna. …". Never "lunar". */
const NAME = /^(?:(?:hey|hi|hello|ok|okay)\s+)?(?:luna|loona|lunah)\b[\s,.!:;-]*/i;

/** What was said with her name taken off the front, and whether it was there: she was spoken to. */
export function heard(transcript: string): { text: string; addressed: boolean } {
  const t = transcript.trim();
  const m = t.match(NAME);
  return m ? { text: t.slice(m[0].length).trim(), addressed: true } : { text: t, addressed: false };
}

const UNITS: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ORD_UNITS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9 };
const ORD_TEENS: Record<string, number> = { tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19 };
const ORD_TENS: Record<string, number> = { twentieth: 20, thirtieth: 30 };

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/**
 * Spoken numbers written as the app writes them: "rim two" → "rim 2", "fourteen days" → "14 days", "the twentieth of
 * January" → "the 20th of January", and a year said in two pairs ("twenty twenty seven") or with "thousand" → 2027.
 */
export function spokenToDigits(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const at = (j: number) => words[j]?.toLowerCase() ?? '';
  // One number from word j: its value, whether it is an ordinal, and the word after it.
  const chunk = (j: number): { v: number; ord: boolean; next: number } | null => {
    const w = at(j);
    if (w in TENS) {
      const n = at(j + 1);
      if (n in UNITS && UNITS[n] > 0) return { v: TENS[w] + UNITS[n], ord: false, next: j + 2 };
      if (n in ORD_UNITS) return { v: TENS[w] + ORD_UNITS[n], ord: true, next: j + 2 };
      return { v: TENS[w], ord: false, next: j + 1 };
    }
    if (w in TEENS) return { v: TEENS[w], ord: false, next: j + 1 };
    if (w in UNITS) return { v: UNITS[w], ord: false, next: j + 1 };
    if (w in ORD_TENS) return { v: ORD_TENS[w], ord: true, next: j + 1 };
    if (w in ORD_TEENS) return { v: ORD_TEENS[w], ord: true, next: j + 1 };
    if (w in ORD_UNITS) return { v: ORD_UNITS[w], ord: true, next: j + 1 };
    return null;
  };
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    const c = chunk(i);
    if (!c) {
      out.push(words[i]);
      i++;
      continue;
    }
    // "two thousand (and) twenty seven".
    if (!c.ord && at(c.next) === 'thousand') {
      let v = c.v * 1000, j = c.next + 1;
      if (at(j) === 'and') j++;
      const r = chunk(j);
      if (r && !r.ord) {
        v += r.v;
        j = r.next;
      }
      out.push(String(v));
      i = j;
      continue;
    }
    // "twenty twenty seven": a year said in two pairs.
    if (!c.ord && (c.v === 19 || c.v === 20)) {
      const r = chunk(c.next);
      if (r && !r.ord && r.v >= 10) {
        out.push(String(c.v * 100 + r.v));
        i = r.next;
        continue;
      }
    }
    out.push(c.ord ? ordinal(c.v) : String(c.v));
    i = c.next;
  }
  return out.join(' ');
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
];

/** "the 20th of January" and "January the 20th", as the planner's dates read: "20th January", "January 20th". */
function tidyDates(t: string): string {
  return t.replace(/\b(?:the )?(\d{1,2}(?:st|nd|rd|th)) of ([a-z]+)/g, '$1 $2').replace(/\b([a-z]+) the (\d{1,2}(?:st|nd|rd|th))\b/g, '$1 $2');
}

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
const THANKS = /^(?:thank you|thanks|thank you very much|thanks a lot|cheers)$/;
const HELLO = /^(?:hello|hi|hey|hello there|hi there|good (?:morning|afternoon|evening))$/;

/** What Luna does with what she heard: her own command, the planner's, a question for the model, or nothing. */
export function parseCommand(transcript: string, sites: Site[]): LunaCommand {
  const { text: said, addressed } = heard(transcript);
  const t = normalize(said);
  // Her name alone is a greeting: she answers.
  if (!t) return addressed ? { kind: 'hello' } : { kind: 'nothing' };
  if (STOP.test(t)) return { kind: 'stop' };
  if (THANKS.test(t)) return { kind: 'thanks' };
  if (HELLO.test(t)) return { kind: 'hello' };
  if (HELP.test(t)) return { kind: 'help' };
  for (const [re, theme] of THEME) if (re.test(t)) return { kind: 'theme', theme };
  for (const [re, control] of CONTROLS) if (re.test(t)) return { kind: 'control', control };
  for (const [re, place] of PLACES) if (re.test(t)) return { kind: 'go', place };
  let planned = tidyDates(spokenToDigits(t));
  for (const [re, name] of SPOKEN_NAMES) planned = planned.replace(re, name);
  const r = matchIntent(planned, sites);
  if (r) return { kind: 'planner', actions: r.actions, reply: r.reply };
  // A question for the model: three words or more, in the words said (the figures as spoken, the name taken off).
  if (t.split(' ').length >= 3) return { kind: 'ask', prompt: said.replace(/\s+/g, ' ').trim() };
  return { kind: 'nothing' };
}
