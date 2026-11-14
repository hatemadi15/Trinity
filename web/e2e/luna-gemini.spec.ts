import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Luna with Gemini's help (spec 22.5), in the built app: her ears where the browser has no speech recognition, her
 * voice and its fallback, her questions marked as hers, and demo mode keeping off both voice routes. No Gemini here:
 * the browser's requests to the voice routes and the assistant are answered by the journey, which records what each
 * was sent; the routes themselves are tested with fetch stood in for Gemini (src/app/api/*).
 *
 * The stand-in microphone is Chromium's own fake device (a tone), allowed without a prompt; WebGL in software, as in
 * playwright.config.ts, whose launch options these replace for this file.
 */
test.use({
  permissions: ['microphone'],
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    ...(process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : {}),
  },
});

type Watched = { __spoken: string[]; __plays: string[] };

/**
 * Watches her two voices: the browser's (a stand-in speechSynthesis that records what it is asked to say and ends at
 * once) and her audio element (the real play, its sources recorded). Without `recognition`, the browser has no speech
 * recognition, as Firefox has none.
 */
async function watchVoices(page: Page, { recognition = true } = {}) {
  await page.addInitScript((keep) => {
    const w = window as unknown as Record<string, unknown> & Watched;
    if (!keep) {
      for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
    }
    w.__spoken = [];
    w.__plays = [];
    const synth = {
      speak(u: SpeechSynthesisUtterance) {
        w.__spoken.push(u.text);
        setTimeout(() => u.onend?.(new Event('end') as SpeechSynthesisEvent), 30);
      },
      cancel() {},
      pause() {},
      resume() {},
      getVoices: () => [],
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => true,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      // The moment of silence her button plays to ready the element is not a reply.
      if (!this.src.startsWith('data:')) w.__plays.push(this.src);
      return play.call(this);
    };
  }, recognition);
}

const watched = (page: Page) => page.evaluate(() => ({ spoken: (window as unknown as Watched).__spoken, plays: (window as unknown as Watched).__plays }));

/** 0.4 s of a quiet tone as 16-bit 24 kHz mono WAV, as /api/speak answers. */
function toneWav(): Buffer {
  const rate = 24_000;
  const pcm = Buffer.alloc(Math.round(rate * 0.4) * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Her two voice routes as a server with Gemini's key answers them; `state.speech` says whether speech is there. */
async function voiceRoutes(page: Page, heard = 'open the site list') {
  const state = { speech: 'available' as 'available' | 'unavailable' };
  const asked = { speak: [] as string[], transcribe: [] as { type: string; bytes: Buffer }[], probes: 0 };
  await page.route('**/api/speak', async (route) => {
    asked.speak.push((route.request().postDataJSON() as { text: string }).text);
    if (state.speech === 'unavailable') return route.fulfill({ status: 503, json: { available: false, reason: 'no-key' } });
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: toneWav() });
  });
  await page.route('**/api/transcribe', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      asked.probes++;
      return route.fulfill({ status: 200, json: { available: true, model: 'gemini-2.5-flash' } });
    }
    asked.transcribe.push({ type: req.headers()['content-type'] ?? '', bytes: req.postDataBuffer() ?? Buffer.alloc(0) });
    return route.fulfill({ status: 200, json: { text: heard } });
  });
  return { state, asked };
}

const lunaPanel = (page: Page) => page.getByRole('region', { name: 'Luna' });

async function typeToLuna(page: Page, words: string) {
  await lunaPanel(page).getByRole('textbox', { name: 'Type to Luna' }).fill(words);
  await lunaPanel(page).getByRole('button', { name: 'Send' }).click();
}

test.describe('Luna with Gemini’s help', () => {
  test('in a browser without speech recognition she records a phrase at a press, has it written down, does what it says and answers in Gemini’s voice', async ({ page, shot }) => {
    await watchVoices(page, { recognition: false });
    const { asked } = await voiceRoutes(page, 'open the site list');
    await page.goto('/learn');
    await page.getByRole('button', { name: 'Luna', exact: true }).click();
    const panel = lunaPanel(page);
    await expect(panel.getByText('Press the microphone and speak; press it again when you have finished.')).toBeVisible();
    expect(asked.probes).toBe(1);
    await panel.getByRole('button', { name: 'Speak to Luna' }).click();
    await expect(panel.getByText('Listening. Press the square when you have finished.')).toBeVisible();
    await shot('recording');
    // A second of the stand-in microphone's tone, then the press that sends it.
    await page.waitForTimeout(1200);
    await panel.getByRole('button', { name: 'Stop and send' }).click();
    await expect(page).toHaveURL(/\/sites$/);
    // The browser decoded its own recording and sent 16 kHz mono WAV, about a second of it.
    expect(asked.transcribe).toHaveLength(1);
    const { type, bytes } = asked.transcribe[0];
    expect(type).toBe('audio/wav');
    expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
    expect([bytes.readUInt16LE(22), bytes.readUInt32LE(24), bytes.readUInt16LE(34)]).toEqual([1, 16_000, 16]);
    expect(bytes.length).toBeGreaterThan(44 + 16_000);
    await expect(lunaPanel(page).getByText('open the site list')).toBeVisible();
    await expect(lunaPanel(page).getByText('Opening the site list.')).toBeVisible();
    await expect.poll(() => asked.speak).toEqual(['Opening the site list.']);
    await expect.poll(async () => (await watched(page)).plays).toHaveLength(1);
    expect((await watched(page)).plays[0]).toMatch(/^blob:/);
    expect((await watched(page)).spoken).toEqual([]);
    // Said, she waits for the next press.
    await expect(lunaPanel(page).getByText('Press the microphone and speak; press it again when you have finished.')).toBeVisible();
    await shot('answered');
  });

  test('she asks Gemini first and says her replies in its voice; without it, in the browser’s own for the rest of the visit; the Ask box names Gemini when it answers', async ({ page }) => {
    await watchVoices(page);
    const { state, asked } = await voiceRoutes(page);
    const chats: Record<string, unknown>[] = [];
    await page.route('**/api/chat', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      chats.push(body);
      const reply = body.from === 'luna' ? 'Start with the forecast for the site you have in mind.' : 'The forecast shows when the Sun and Earth are above the skyline.';
      return route.fulfill({ status: 200, json: { source: 'model', model: 'gemini-2.5-flash', actions: [], reply } });
    });
    await page.goto('/learn');
    await page.getByRole('button', { name: 'Luna', exact: true }).click();
    await typeToLuna(page, 'what should a planner look at first');
    await expect(lunaPanel(page).getByText('Start with the forecast for the site you have in mind.')).toBeVisible();
    expect(chats[0]).toMatchObject({ prompt: 'what should a planner look at first', from: 'luna' });
    await expect.poll(() => asked.speak).toEqual(['Start with the forecast for the site you have in mind.']);
    await expect.poll(async () => (await watched(page)).plays).toHaveLength(1);
    // The server has no key now: the browser's own voice says the reply, and she asks for Gemini's no more.
    state.speech = 'unavailable';
    await typeToLuna(page, 'how it works');
    await expect.poll(async () => (await watched(page)).spoken).toEqual(['Opening How it works.']);
    await typeToLuna(page, 'open the site list');
    await expect(page).toHaveURL(/\/sites$/);
    await expect.poll(async () => (await watched(page)).spoken).toEqual(['Opening How it works.', 'Opening the site list.']);
    expect(asked.speak).toHaveLength(2);
    expect((await watched(page)).plays).toHaveLength(1);

    // "Ask in plain words" says nothing of who asks, so the server keeps OpenRouter first; the answer names its model.
    await page.goto('/compare');
    const ask = page.getByRole('region', { name: 'Ask in plain words' });
    await ask.getByRole('textbox', { name: 'Ask the assistant' }).fill('what does the forecast show');
    await ask.getByRole('button', { name: 'Ask' }).click();
    await expect(ask.getByText('The forecast shows when the Sun and Earth are above the skyline.')).toBeVisible();
    await expect(ask.getByText('answered by Gemini 2.5 Flash, after you asked “what does the forecast show”')).toBeVisible();
    expect(chats.at(-1)).toMatchObject({ prompt: 'what does the forecast show' });
    expect(chats.at(-1)).not.toHaveProperty('from');
  });

  test('in demo mode she never calls her voice routes: no microphone where the browser cannot listen, the browser’s voice for her replies', async ({ page }) => {
    await watchVoices(page, { recognition: false });
    const { asked } = await voiceRoutes(page);
    await page.goto('/learn?demo=1');
    await page.getByRole('button', { name: 'Luna', exact: true }).click();
    const panel = lunaPanel(page);
    await expect(panel.getByText('This browser has no voice input: type to Luna below.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Speak to Luna' })).toHaveCount(0);
    await typeToLuna(page, 'open the site list');
    await expect(page).toHaveURL(/\/sites/);
    await expect.poll(async () => (await watched(page)).spoken).toEqual(['Opening the site list.']);
    expect(asked).toEqual({ speak: [], transcribe: [], probes: 0 });
    expect((await watched(page)).plays).toEqual([]);
  });
});
