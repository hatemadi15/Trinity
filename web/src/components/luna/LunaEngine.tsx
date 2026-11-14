'use client';
import { useEffect, useRef } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { askPlanner } from '@/lib/ai/client';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { parseCommand } from '@/lib/luna/commands';
import { runCommand, type LunaDeps } from '@/lib/luna/run';
import { hush, recognitionCtor, speak as browserSpeak, type Recognition, type RecognitionCtor } from '@/lib/luna/speech';
import { lunaStore } from '@/lib/luna/store';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { scenarioStore } from '@/lib/store/scenarios';
import { applyTheme } from '@/lib/theme';

/** How long after the browser ends its recognition (it does after a silence) Luna listens again, in ms. */
const RESTART_MS = 300;

/**
 * Luna's engine (spec 22), once for the whole app, in the root layout, so she keeps listening from page to page. While
 * she is on, the browser's speech recognition runs (continuous, English); each phrase it hears to the end is a command
 * (parseCommand) carried out on the page (runCommand), and her reply is said aloud, with the recognition stopped
 * meanwhile so she never hears herself. Without voice input, or with the microphone blocked, she takes typed words
 * (`lunaStore.submit`). Off, nothing listens. Renders nothing: her button and panel are LunaButton.
 */
export function LunaEngine({
  store = exploreStore,
  ask = askPlanner,
  recognition = recognitionCtor,
  speak = browserSpeak,
  navigate,
}: {
  store?: StoreApi<ExploreState>;
  ask?: LunaDeps['ask'];
  recognition?: () => RecognitionCtor | null;
  speak?: (text: string, done: () => void) => boolean;
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
    let turnOff = false;
    let restart = 0;
    let rec: Recognition | null = null;
    let mode: 'listening' | 'typing' | 'blocked' | 'offline' = 'typing';
    const idle = () => lunaStore.setState({ status: mode });
    const listen = () => {
      if (!alive || speaking || mode !== 'listening' || !rec) return;
      try {
        rec.start();
      } catch {
        // Already listening.
      }
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
      scenarios: scenarioStore,
    };
    const handle = async (text: string) => {
      const said = text.trim();
      if (!said || !alive) return;
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
        reply = await runCommand(parseCommand(said, store.getState().sites), deps, said);
      } catch {
        reply = 'That did not work; please try again.';
      }
      if (!alive) return;
      if (!reply) {
        idle();
        return;
      }
      lunaStore.setState({ reply, status: 'speaking' });
      speaking = true;
      rec?.abort();
      speak(reply, () => {
        speaking = false;
        if (turnOff) {
          lunaStore.getState().setOn(false);
          return;
        }
        if (!alive) return;
        idle();
        listen();
      });
    };
    lunaStore.setState({ submit: (t) => void handle(t), heard: null, reply: null });

    const Ctor = recognition();
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
          if (r.isFinal && r[0]) void handle(r[0].transcript);
        }
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') mode = 'blocked';
        else if (e.error === 'network') mode = 'offline';
        else return;
        idle();
      };
      rec.onend = () => {
        if (alive && !speaking && mode === 'listening') restart = window.setTimeout(listen, RESTART_MS);
      };
    }
    idle();
    listen();
    return () => {
      alive = false;
      window.clearTimeout(restart);
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      }
      hush();
      lunaStore.setState({ submit: () => {}, status: 'off' });
    };
  }, [on, store, ask, recognition, speak]);

  return null;
}
