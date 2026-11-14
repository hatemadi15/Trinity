import { describe, expect, it, vi } from 'vitest';
import { createExploreStore } from '../store/explore';
import { fileLoaders } from '@/test/file-loaders';
import { parseCommand } from './commands';
import { runCommand, type LunaDeps } from './run';
import { skyAnswer, skyQuestion } from './sky';

/** A store with the real catalogue, on de Gerlache Rim 2 from 1 January 2027 for 30 days, at an hour of it. */
async function loaded(hour = 0) {
  const store = createExploreStore(fileLoaders());
  await store.getState().init();
  await store.getState().selectSite('de_gerlache_rim_2');
  store.getState().setWindow('2027-01-01T00:00:00', 30);
  store.getState().setCursor(hour);
  return store;
}

describe('the questions on the sky Luna answers', () => {
  it('hears how long until the Sun sets or rises, when Earth sets or rises, and when the next contact is', () => {
    for (const t of ['how long until sunset', 'how long till sunset', 'when does the sun set', 'when is the next sunrise', 'how long until the sun rises', 'when will the sun go down']) expect(skyQuestion(t), t).toBe('sun');
    for (const t of ['when does earth set', 'when does the earth rise', 'how long until earth sets', 'when will earth rise']) expect(skyQuestion(t), t).toBe('earth');
    for (const t of ['when is the next contact', 'when is the next radio window', 'when can the lander talk to earth', 'next contact']) expect(skyQuestion(t), t).toBe('contact');
    expect(skyQuestion('play the month')).toBeNull();
  });

  it('takes them before the planner and the model, her name and a please taken off as for every command', () => {
    expect(parseCommand('Luna, how long until sunset?', [])).toEqual({ kind: 'sky', question: 'sun' });
    expect(parseCommand('Hey Luna, when does Earth set?', [])).toEqual({ kind: 'sky', question: 'earth' });
    expect(parseCommand('When is the next contact, please?', [])).toEqual({ kind: 'sky', question: 'contact' });
  });
});

describe('what Luna answers on the sky', () => {
  it('counts down from the time bar’s hour, in whole words for speech, with the day and the time in UTC', async () => {
    const s = (await loaded(10)).getState();
    expect(skyAnswer('sun', s)).toBe('Sunset in 2 days 9 hours, on 3 January at 19:00 UTC.');
    expect(skyAnswer('earth', s)).toBe('Earth is out of view now. It rises in 8 days 17 hours, on 10 January at 03:00 UTC.');
    expect(skyAnswer('contact', s)).toBe('The next radio window opens in 8 days 17 hours, on 10 January at 03:00 UTC. The lander has no power then.');
  });

  it('says what holds in the window, the condition beside the power it holds for, and what does not come before the period ends', async () => {
    const s = (await loaded(500)).getState();
    expect(skyAnswer('sun', s)).toBe('No sunset before the end of the period.');
    expect(skyAnswer('earth', s)).toBe('Earth sets in 1 day 19 hours, on 23 January at 15:00 UTC.');
    expect(skyAnswer('contact', s)).toBe('Earth is in view now, so a radio link is geometrically possible, and the lander has power, if it survived the cold. This window closes in 1 day 19 hours, on 23 January at 15:00 UTC.');
    const night = (await loaded(300)).getState();
    expect(skyAnswer('sun', night)).toBe('The Sun is set now. Sunrise in 6 days 22 hours, on 20 January at 10:00 UTC.');
    expect(skyAnswer('contact', night)).toBe('Earth is in view now, so a radio link is geometrically possible, but the lander has no power. This window closes in 10 days 3 hours, on 23 January at 15:00 UTC.');
    const late = (await loaded(600)).getState();
    expect(skyAnswer('earth', late)).toBe('Earth is out of view now, and does not rise before the end of the period.');
    expect(skyAnswer('contact', late)).toBe('No radio window opens before the end of the period.');
  });

  it('asks for a forecast first when none is open', () => {
    const store = createExploreStore(fileLoaders());
    expect(skyAnswer('sun', store.getState())).toBe('Open a forecast first: say "open the forecast".');
  });

  it('answers through her runner, on any page', async () => {
    const store = await loaded(10);
    const deps: LunaDeps = { store, navigate: vi.fn(), path: () => '/explore', ask: vi.fn(), setTheme: vi.fn(), turnOff: vi.fn(), setVoice: vi.fn() };
    expect(await runCommand({ kind: 'sky', question: 'sun' }, deps)).toBe('Sunset in 2 days 9 hours, on 3 January at 19:00 UTC.');
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.ask).not.toHaveBeenCalled();
  });
});
