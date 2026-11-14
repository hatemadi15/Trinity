import { describe, expect, it } from 'vitest';
import type { Site } from '../data/loaders';
import { readJson } from '../engine/__tests__/helpers';
import { heard, parseCommand, spokenToDigits, type LunaCommand } from './commands';

/** A few catalogue sites, by the names the catalogue gives them. */
const sites = [
  { id: 'de_gerlache_rim_2', name: 'de Gerlache Rim 2 (Artemis III region)' },
  { id: 'nobile_rim_2', name: 'Nobile Rim 2 (Artemis III region)' },
  { id: 'shackleton_center_rim_high', name: 'Peak near Shackleton' },
  { id: 'malapert_massif', name: 'Malapert Massif (Artemis III region)' },
  { id: 'haworth', name: 'Haworth (Artemis III region)' },
] as unknown as Site[];

const control = (c: string): LunaCommand => ({ kind: 'control', control: c } as LunaCommand);
const go = (place: string): LunaCommand => ({ kind: 'go', place } as LunaCommand);

describe('what Luna hears', () => {
  it('takes "Luna" off the front as her name, with a greeting or a comma, and says she was spoken to', () => {
    expect(heard('Luna, play')).toEqual({ text: 'play', addressed: true });
    expect(heard('hey Luna turn to Earth')).toEqual({ text: 'turn to Earth', addressed: true });
    expect(heard('OK Luna. Next.')).toEqual({ text: 'Next.', addressed: true });
    expect(heard('play')).toEqual({ text: 'play', addressed: false });
    // "Lunar" is a word of the app's own, never her name.
    expect(heard('lunar south pole')).toEqual({ text: 'lunar south pole', addressed: false });
  });

  it('writes spoken numbers as figures, so "rim two" and "fourteen days" read as the app writes them', () => {
    expect(spokenToDigits('compare nobile rim two and de gerlache rim two for fourteen days')).toBe('compare nobile rim 2 and de gerlache rim 2 for 14 days');
    expect(spokenToDigits('make it ninety days')).toBe('make it 90 days');
    expect(spokenToDigits('start on the twentieth of january twenty twenty seven')).toBe('start on the 20th of january 2027');
  });
});

describe('Luna’s commands', () => {
  const parse = (t: string) => parseCommand(t, sites);

  it('drives the player in the words people use for one', () => {
    for (const t of ['play', 'Play the month', 'start playing', 'resume', 'keep going']) expect(parse(t), t).toEqual(control('play'));
    for (const t of ['pause', 'stop', 'hold on', 'wait', 'freeze']) expect(parse(t), t).toEqual(control('pause'));
    for (const t of ['next', 'next moment', 'skip ahead', "what's next", 'go to the next moment']) expect(parse(t), t).toEqual(control('next'));
    for (const t of ['previous', 'go back', 'previous moment', 'back one']) expect(parse(t), t).toEqual(control('previous'));
    for (const t of ['faster', 'speed up', 'speed it up', 'double speed', 'go faster']) expect(parse(t), t).toEqual(control('faster'));
    for (const t of ['slower', 'slow down', 'normal speed', 'go slower']) expect(parse(t), t).toEqual(control('slower'));
    for (const t of ['replay', 'start over', 'from the beginning', 'rewind', 'restart']) expect(parse(t), t).toEqual(control('replay'));
  });

  it('turns the view from the site to the Sun, Earth, the lander, the sky and back, with or without "please"', () => {
    for (const t of ['turn to the sun', 'look at the Sun', 'face the sun', 'show me the sun', "where's the sun", 'please turn to the sun']) expect(parse(t), t).toEqual(control('turn-sun'));
    for (const t of ['turn to earth', 'look at the earth', 'show me Earth', 'where is earth', 'can you face Earth']) expect(parse(t), t).toEqual(control('turn-earth'));
    for (const t of ['turn to the lander', 'show me the lander', 'look at the lander', 'where is the lander']) expect(parse(t), t).toEqual(control('turn-lander'));
    for (const t of ['look up', 'show me the stars', 'look at the sky']) expect(parse(t), t).toEqual(control('look-up'));
    for (const t of ['look ahead', 'look down', 'back to the horizon']) expect(parse(t), t).toEqual(control('look-ahead'));
  });

  it('switches the view’s paths, words and brightness', () => {
    for (const t of ['show the paths', 'show paths', 'paths on']) expect(parse(t), t).toEqual(control('paths-on'));
    for (const t of ['hide the paths', 'paths off']) expect(parse(t), t).toEqual(control('paths-off'));
    for (const t of ['hide the words', 'clean view', 'no words']) expect(parse(t), t).toEqual(control('words-off'));
    for (const t of ['show the words', 'bring back the words']) expect(parse(t), t).toEqual(control('words-on'));
    for (const t of ['brighter', 'brighter picture', 'make it brighter', "it's too dark"]) expect(parse(t), t).toEqual(control('brighter-on'));
    for (const t of ['normal brightness', 'less bright', 'darker']) expect(parse(t), t).toEqual(control('brighter-off'));
  });

  it('lands on the better day, and flies to the pole from the home page', () => {
    for (const t of ['land on the better day', 'try the better day', 'better day', 'try the better date instead']) expect(parse(t), t).toEqual(control('better-day'));
    for (const t of ['fly to the south pole', 'take off', 'start the flight']) expect(parse(t), t).toEqual(control('fly'));
  });

  it('shows the year: every landing day of the next 12 months', () => {
    for (const t of ['show me the year', 'show the whole year', 'the year', 'year at a glance', 'every landing day', 'show me every landing day', 'all the landing days']) expect(parse(t), t).toEqual(control('year'));
  });

  it('goes to every page, the view from the site and home among them', () => {
    for (const t of ['stand at the site', 'open the stand view', 'stand on the moon', 'show me the view from the ground', 'land', 'land there', 'take me to the surface', '3D view']) expect(parse(t), t).toEqual(go('stand'));
    for (const t of ['go home', 'home page', 'go to the start page', 'back to the start']) expect(parse(t), t).toEqual(go('home'));
    for (const t of ['explore', 'open the forecast', 'show the forecast', 'the full forecast']) expect(parse(t), t).toEqual(go('explore'));
    for (const t of ['choose a site', 'all sites', 'the site list']) expect(parse(t), t).toEqual(go('sites'));
    for (const t of ['compare sites', 'open compare', 'go to compare']) expect(parse(t), t).toEqual(go('compare'));
    for (const t of ['accuracy', 'open accuracy', 'show me the checks']) expect(parse(t), t).toEqual(go('validate'));
    for (const t of ['how it works', 'open how it works']) expect(parse(t), t).toEqual(go('learn'));
    for (const t of ['the brief', 'printable brief', 'open the brief', 'mission brief']) expect(parse(t), t).toEqual(go('brief'));
  });

  it('changes the theme, helps, says hello and thanks, and stops listening when told', () => {
    for (const t of ['dark mode', 'switch to dark', 'dark theme']) expect(parse(t), t).toEqual({ kind: 'theme', theme: 'dark' });
    for (const t of ['light mode', 'switch to light']) expect(parse(t), t).toEqual({ kind: 'theme', theme: 'light' });
    for (const t of ['help', 'what can you do', 'what can I say']) expect(parse(t), t).toEqual({ kind: 'help' });
    for (const t of ['stop listening', 'goodbye', 'turn off', 'go to sleep', "that's all"]) expect(parse(t), t).toEqual({ kind: 'stop' });
    for (const t of ['thank you', 'thanks']) expect(parse(t), t).toEqual({ kind: 'thanks' });
    for (const t of ['hello', 'hi']) expect(parse(t), t).toEqual({ kind: 'hello' });
    // Her name alone is a greeting too: she answers rather than wait in silence.
    for (const t of ['Luna', 'hey Luna', 'Luna?']) expect(parse(t), t).toEqual({ kind: 'hello' });
  });

  it('hands the planner’s own phrasings to the planner, sites by their spoken names', () => {
    const show = parse('show me nobile rim two');
    expect(show.kind).toBe('planner');
    expect(show.kind === 'planner' && show.actions).toEqual([{ type: 'select_site', id: 'nobile_rim_2' }]);
    // "the Gerlache" and "noble" are how speech often writes these names.
    const both = parse('compare the gerlache rim 2 and noble rim two for fourteen days');
    expect(both.kind === 'planner' && both.actions.map((a) => a.type)).toEqual(['add_to_compare', 'add_to_compare', 'set_window', 'open_page']);
    expect(both.kind === 'planner' && both.actions.slice(0, 2)).toEqual([
      { type: 'add_to_compare', id: 'de_gerlache_rim_2' },
      { type: 'add_to_compare', id: 'nobile_rim_2' },
    ]);
    const best = parse('find the best landing date for 30 days');
    expect(best.kind === 'planner' && best.actions).toEqual([{ type: 'find_best_window', days: 30, scope: 'site' }]);
    const start = parse('start on january 20th 2027');
    expect(start.kind === 'planner' && start.actions).toEqual([{ type: 'set_window', startUtc: '2027-01-20T00:00:00' }]);
    expect(parse('explain the longest night').kind).toBe('planner');
  });

  it('keeps its own words before the planner’s: "show me the sun" turns the view, it names no site', () => {
    expect(parse('show me the sun')).toEqual(control('turn-sun'));
    expect(parse('show me the lander')).toEqual(control('turn-lander'));
    // A site after "fly to" is the planner's.
    expect(parse('fly to haworth').kind).toBe('planner');
  });

  it('asks the model what it cannot match, three words or more, and lets a stray word or two go', () => {
    expect(parse('why is there no radio contact on the first night')).toEqual({ kind: 'ask', prompt: 'why is there no radio contact on the first night' });
    expect(parse('um')).toEqual({ kind: 'nothing' });
    expect(parse('yeah okay')).toEqual({ kind: 'nothing' });
    expect(parse('')).toEqual({ kind: 'nothing' });
  });
});

describe('the catalogue’s newer names, as speech writes them', () => {
  const catalogue = [...readJson<{ sites: Site[] }>('data', 'sites.json').sites, ...readJson<{ sites: Site[] }>('data', 'sites_derived.json').sites];
  const pick = (said: string) => {
    const c = parseCommand(said, catalogue);
    return c.kind === 'planner' ? c.actions.map((a) => ('id' in a ? a.id : a.type)) : c.kind;
  };

  it.each([
    ['show me apollo eleven', 'apollo_11'],
    ['show me apollo seventeen', 'apollo_17'],
    ['show me chandrayaan three', 'chandrayaan3_vikram'],
    ['show me chandrayan three', 'chandrayaan3_vikram'],
    ['show me change four', 'change4'],
    ['show me chang e six', 'change6'],
    ['show me changy five', 'change5'],
    ['show me the slim lander', 'slim'],
    ['show me rainer gamma', 'im3_reiner_gamma'],
    ['show me i m three', 'im3_reiner_gamma'],
    ['show me schroedinger', 'cp12_schrodinger'],
    ['show me shrodinger basin', 'cp12_schrodinger'],
    ['Luna, show me luna twenty five', 'luna25_target'],
  ])('hears "%s" as %s', (said, id) => {
    expect(pick(said)).toEqual([id]);
  });

  it('compares two of them by their spoken names', () => {
    expect(pick('compare apollo eleven and change four')).toEqual(['apollo_11', 'change4', 'open_page']);
  });

  it('never takes the probe Luna 25 for her name', () => {
    expect(heard('Luna twenty five').addressed).toBe(false);
    expect(heard('Luna 25 please').addressed).toBe(false);
    expect(heard('Luna, show me Apollo 11')).toEqual({ text: 'show me Apollo 11', addressed: true });
  });
});
