import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Level } from './engine/shadow';
import type { ShadowRequest, ShadowResponse } from './engine/shadow-handler';
import { ShadowClient } from './shadow-client';

/** These tests draw their small levels as they are: a client refines a coarse site's finest level to 1024 pixels by default. */
const AS_GIVEN = { minPx: 0 };

const flat = (w: number, h: number): Level => ({ heights: new Float32Array(w * h), width: w, height: h, pxM: 20, siteCol: (w - 1) / 2, siteRow: (h - 1) / 2 });

/** A flat level with a 300 m wall one column in from its right edge, so a low Sun from the right shades most of it. */
const walled = (w: number, h: number): Level => {
  const heights = new Float32Array(w * h);
  for (let r = 0; r < h; r++) heights[r * w + w - 2] = 300;
  return { ...flat(w, h), heights };
};

/** The answer, or a failure naming the bug when none comes: a request left waiting forever. */
const within = <T>(p: Promise<T>, ms = 1000): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`no answer within ${ms} ms`)), ms))]);

/** A stand-in for the browser's Worker: it keeps what it is sent, answers when the test says, and fails when told to. */
class FakeWorker {
  static made: FakeWorker[] = [];
  onmessage: ((event: { data: ShadowResponse }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  sent: ShadowRequest[] = [];
  terminated = false;
  constructor() {
    FakeWorker.made.push(this);
  }
  postMessage(req: ShadowRequest) {
    this.sent.push(req);
  }
  terminate() {
    this.terminated = true;
  }
  answer(res: ShadowResponse) {
    this.onmessage?.({ data: res });
  }
  /** The script could not load, or the worker crashed. */
  fail() {
    this.onerror?.({ message: 'worker crashed' });
  }
  /** A message from the worker could not be read on this side. */
  failToRead() {
    this.onmessageerror?.({});
  }
}

/** A client whose worker is a FakeWorker, with that worker. */
function withFakeWorker(): { client: ShadowClient; worker: FakeWorker } {
  vi.stubGlobal('Worker', FakeWorker);
  const client = new ShadowClient(AS_GIVEN);
  const worker = FakeWorker.made[FakeWorker.made.length - 1];
  return { client, worker };
}

/** Levels the fake worker accepted, as the real one does. */
async function accepted(client: ShadowClient, worker: FakeWorker, key: string, levels: Level[]) {
  const set = client.setLevels(key, levels);
  const req = worker.sent[worker.sent.length - 1];
  expect(req).toMatchObject({ type: 'levels', key });
  worker.answer({ id: req.id, type: 'ok' });
  await within(set);
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.made = [];
});

describe('ShadowClient (no worker: it runs the handler itself)', () => {
  it('returns the picture of the latest request and nothing for one it overtook', async () => {
    const client = new ShadowClient(AS_GIVEN);
    await client.setLevels('a', [flat(12, 10)]);
    const first = client.picture('a', 90, 2, false);
    const second = client.picture('a', 100, 3, false);
    expect(await first).toBeNull();
    const latest = await second;
    expect(latest).toMatchObject({ type: 'picture', key: 'a', width: 12, height: 10, siteLit: true });
    client.dispose();
  });

  it('keeps the requests for two sets of levels apart', async () => {
    const client = new ShadowClient(AS_GIVEN);
    await client.setLevels('a', [flat(12, 10)]);
    await client.setLevels('b', [flat(8, 8)]);
    const [a, b] = await Promise.all([client.picture('a', 90, 2, true), client.picture('b', 90, 2, false)]);
    expect(a).toMatchObject({ key: 'a', width: 6, height: 5 });
    expect(b).toMatchObject({ key: 'b', width: 8, height: 8 });
    client.dispose();
  });
});

describe('ShadowClient when the worker fails', () => {
  it('sweeps on this thread when the browser refuses to start the worker', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('blocked by the page policy');
        }
      },
    );
    const client = new ShadowClient(AS_GIVEN);
    await within(client.setLevels('a', [flat(12, 10)]));
    expect(await within(client.picture('a', 90, 2, false))).toMatchObject({ type: 'picture', key: 'a', width: 12, height: 10, siteLit: true });
    client.dispose();
  });

  it('answers the pictures still waiting from the inline sweep, with the levels it was given', async () => {
    const levels = [walled(12, 10)];
    const { client, worker } = withFakeWorker();
    await accepted(client, worker, 'a', levels);
    const overtaken = client.picture('a', 80, 2, false);
    const waiting = client.picture('a', 90, 2, false);
    expect(worker.sent.slice(-2).map((r) => r.type)).toEqual(['shade', 'shade']);
    worker.fail();
    expect(await within(overtaken)).toBeNull();
    const got = await within(waiting);
    expect(worker.terminated).toBe(true);

    // The very picture a client without a worker draws from the same levels.
    vi.unstubAllGlobals();
    const reference = new ShadowClient(AS_GIVEN);
    await reference.setLevels('a', levels);
    const want = (await reference.picture('a', 90, 2, false))!;
    expect(got).toMatchObject({ type: 'picture', key: 'a', width: want.width, height: want.height, siteLit: want.siteLit });
    expect(Array.from(got!.pixels)).toEqual(Array.from(want.pixels));
    expect(new Set(want.pixels).size).toBeGreaterThan(1); // the wall makes a picture worth comparing
    client.dispose();
    reference.dispose();
  });

  it('keeps answering from the inline sweep after the worker fails with nothing waiting, and still reports what it cannot draw', async () => {
    const { client, worker } = withFakeWorker();
    await accepted(client, worker, 'a', [flat(12, 10)]);
    worker.fail();
    const sentBefore = worker.sent.length;
    expect(await within(client.picture('a', 90, 2, false))).toMatchObject({ type: 'picture', key: 'a', width: 12, height: 10, siteLit: true });
    await within(client.setLevels('b', [flat(8, 8)]));
    expect(await within(client.picture('b', 90, 2, true))).toMatchObject({ type: 'picture', key: 'b', width: 4, height: 4 });
    expect(worker.sent.length).toBe(sentBefore); // nothing more goes to the failed worker
    await expect(within(client.picture('never-given', 90, 2, false))).rejects.toThrow(/no terrain held for never-given/);
    client.dispose();
  });

  it('takes over too when a message from the worker cannot be read, and answers a level set still waiting', async () => {
    const { client, worker } = withFakeWorker();
    const set = client.setLevels('b', [flat(8, 8)]);
    const waiting = client.picture('b', 90, 2, true);
    worker.failToRead();
    await within(set);
    expect(await within(waiting)).toMatchObject({ type: 'picture', key: 'b', width: 4, height: 4 });
    expect(worker.terminated).toBe(true);
    client.dispose();
  });

  it('ignores an answer the failed worker sends late', async () => {
    const { client, worker } = withFakeWorker();
    await accepted(client, worker, 'a', [flat(12, 10)]);
    const waiting = client.picture('a', 90, 2, false);
    const shadeId = worker.sent[worker.sent.length - 1].id;
    worker.fail();
    worker.answer({ id: shadeId, type: 'error', message: 'late answer from the dead worker' });
    expect(await within(waiting)).toMatchObject({ type: 'picture', key: 'a' });
    client.dispose();
  });
});

describe('ShadowClient picture size', () => {
  it('asks for every site’s picture at least 1024 pixels across unless told otherwise', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const client = new ShadowClient();
    void client.setLevels('a', [flat(12, 10)]);
    expect(FakeWorker.made[FakeWorker.made.length - 1].sent.at(-1)).toMatchObject({ type: 'levels', key: 'a', minPx: 1024 });
    client.dispose();
  });
});
