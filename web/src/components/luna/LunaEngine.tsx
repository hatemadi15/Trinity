'use client';
import { useEffect, useRef } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { askPlanner } from '@/lib/ai/client';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { parseCommand } from '@/lib/luna/commands';
import { runCommand, type LunaDeps } from '@/lib/luna/run';
import { hush as browserHush, recognitionCtor, speak as browserSpeak, type Recognition, type RecognitionCtor } from '@/lib/luna/speech';
import { lunaStore, message, type LunaMessage } from '@/lib/luna/store';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { scenarioStore } from '@/lib/store/scenarios';
import { applyTheme } from '@/lib/theme';

/** How long after the browser ends its recognition (it does after a silence) Luna listens again, in ms. */
const RESTART_MS = 300;
/** The lines of conversation kept, from page to page. */
const KEPT = 40;
/** Her answer to typed words that ask for nothing she can do. */
export const NOT_CAUGHT = 'I did not catch a request there. Try one of the examples, or ask in other words.';

/**
 * Luna's engine (spec 22), once for the whole app, in the root layout, so she keeps listening from page to page and her
 * conversation lasts (spec 23.2). While she is on, the browser's speech recognition runs (continuous, English); each
 * phrase it hears to the end is a command (parseCommand) carried out on the page (runCommand), and her reply is said
 * aloud, with the recognition stopped meanwhile so she never hears herself. With the switch in her panel off ("Say
 * replies aloud", `lunaStore.voice`) no reply is said aloud: it shows in the conversation only, and the listening goes
 * on; turned off while she speaks, she stops at once. Typed words (`lunaStore.submit`) are commands too: her only way
 * in without voice input or with the microphone blocked. Each exchange goes into her conversation as two lines; a stray
 * word heard in the room is let go without one, while typed words always get an answer. Her panel's microphone pauses
 * the listening and starts it again (`lunaStore.toggleMic`). Off, nothing listens. Renders nothing: her button and
 * panel are LunaButton, and her 3D self LunaDock.
 */
export function LunaEngine({
  store = exploreStore,
  ask = askPlanner,
  recognition = recognitionCtor,
  speak = browserSpeak,
  hush = browserHush,
  navigate,
}: {
  store?: StoreApi<ExploreState>;
  ask?: LunaDeps['ask'];
  recognition?: () => RecognitionCtor | null;
  speak?: (text: string, done: () => void) => boolean;
  /** Stops whatever she is saying. */
  hush?: () => void;
  navigate?: (href: string) => void;
}) {
  const routerNavigate = useNavigate();
  const go = useRef(navigate ?? routerNavigate);
  useEffect(() => {
    go.current = navigate ?? routerNavigate;
  });
  const on = useStore(lunaStore, (s) => s.on);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    let speaking = false;
    // Each reply said aloud has a number, so that the end of one cut short, when the browser reports it, is let go.
    let utterance = 0;
    let turnOff = false;
    // Whether the visitor paused the microphone from her panel.
    let paused = false;
    let restart = 0;
    let rec: Recognition | null = null;
    let mode: 'listening' | 'typing' | 'blocked' | 'offline' = 'typing';
    const idle = () => lunaStore.setState({ status: mode === 'listening' && paused ? 'ready' : mode });
    const listen = () => {
      if (!alive || speaking || paused || mode !== 'listening' || !rec) return;
      try {
        rec.start();
      } catch {
        // Already listening.
      }
    };
    // Her reply said, or cut short: after her goodbye she turns herself off; else she listens again.
    const over = () => {
      speaking = false;
      if (!alive) return;
      if (turnOff) {
        lunaStore.getState().setOn(false);
        return;
      }
      idle();
      listen();
    };
    const deps: LunaDeps = {
      store,
      navigate: (href) => go.current(href),
      path: () => window.location.pathname,
      ask,
      setTheme: (t) => applyTheme(t),
      turnOff: () => {
        turnOff = true;
      },
      setVoice: (v) => lunaStore.getState().setVoice(v),
      scenarios: scenarioStore,
    };
    const add = (line: LunaMessage) => lunaStore.setState((s) => ({ messages: [...s.messages, line].slice(-KEPT) }));
    const handle = async (text: string, typed: boolean) => {
      const said = text.trim();
      if (!said || !alive) return;
      // What she heard shows at once, while she works on it.
      const line = message('you', said);
      add(line);
      lunaStore.setState({ status: 'thinking', heard: said });
      // Site names need the catalogue: loaded once, on the first words that need it.
      if (!store.getState().sites.length) {
        try {
          await store.getState().init();
        } catch {
          // Without the catalogue the pages, the player and the view still answer.
        }
      }
      if (!alive) return;
      let reply: string | null;
      try {
        reply = await runCommand(parseCommand(said, store.getState().sites, { planning: window.location.pathname.startsWith('/plan') }), deps, said);
      } catch {
        reply = 'That did not work; please try again.';
      }
      if (!alive) return;
      if (!reply) {
        // A room is never quite quiet: a stray word heard is let go, its line with it. Typed words get an answer.
        if (typed) add(message('luna', NOT_CAUGHT));
        else lunaStore.setState((s) => ({ messages: s.messages.filter((m) => m.id !== line.id) }));
        idle();
        return;
      }
      add(message('luna', reply));
      lunaStore.setState({ reply });
      if (!lunaStore.getState().voice) {
        // Not said aloud: the reply is in the conversation, and the listening never stopped for it.
        if (turnOff) lunaStore.getState().setOn(false);
        else idle();
        return;
      }
      lunaStore.setState({ status: 'speaking' });
      speaking = true;
      rec?.abort();
      const mine = ++utterance;
      speak(reply, () => {
        if (mine === utterance) over();
      });
    };
    // The switch turned off while she speaks: she stops at once.
    const unsubscribe = lunaStore.subscribe((s, was) => {
      if (s.voice || !was.voice || !speaking) return;
      utterance++;
      hush();
      over();
    });

    const Ctor = recognition();
    const toggleMic = () => {
      if (!alive || !rec) return;
      if (mode === 'listening' && !paused) {
        paused = true;
        window.clearTimeout(restart);
        rec.abort();
      } else {
        // Listening again, or trying again after the microphone was blocked or the network was out.
        paused = false;
        mode = 'listening';
        listen();
      }
      if (!speaking) idle();
    };
    lunaStore.setState({ submit: (t) => void handle(t, true), toggleMic, canListen: !!Ctor, heard: null, reply: null });
    if (Ctor) {
      mode = 'listening';
      rec = new Ctor();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal && r[0]) void handle(r[0].transcript, false);
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') mode = 'blocked';
        else if (e.error === 'network') mode = 'offline';
        else return;
        idle();
      };
      rec.onend = () => {
        if (alive && !speaking && !paused && mode === 'listening') restart = window.setTimeout(listen, RESTART_MS);
      };
    }
    idle();
    listen();
    return () => {
      alive = false;
      unsubscribe();
      window.clearTimeout(restart);
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      }
      hush();
      lunaStore.setState({ submit: () => {}, toggleMic: () => {}, status: 'off' });
    };
  }, [on, store, ask, recognition, speak, hush]);

  return null;
}
