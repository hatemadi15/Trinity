'use client';
import { useEffect, useRef } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { askPlanner } from '@/lib/ai/client';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { parseCommand } from '@/lib/luna/commands';
import { runCommand, type LunaDeps } from '@/lib/luna/run';
import { hush, recognitionCtor, speak as browserSpeak, type Recognition, type RecognitionCtor } from '@/lib/luna/speech';
import { lunaStore, message } from '@/lib/luna/store';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { applyTheme } from '@/lib/theme';

/**
 * Luna's engine (spec 22, a chat since spec 23.2), once for the whole app, in the root layout, so her conversation
 * lasts from page to page. Each message (`lunaStore.submit`) is a command (parseCommand) carried out on the page
 * (runCommand); both lines go into the conversation. The microphone listens only when asked (`lunaStore.dictate`):
 * what it hears is written into the message box as it comes (`draft`, the browser's interim results), and stops after
 * a phrase, so the visitor reads it, mends it if need be and sends it. A dictated message's reply is also said aloud,
 * with the microphone off meanwhile so she never hears herself. Off, nothing listens. Renders nothing: her button and
 * panel are LunaButton and LunaDock.
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
    let rec: Recognition | null = null;
    let listening = false;
    let mode: 'ready' | 'typing' | 'blocked' | 'offline' = 'typing';
    const idle = () => lunaStore.setState({ status: listening ? 'listening' : mode });
    const deps: LunaDeps = {
      store,
      navigate: (href) => go.current(href),
      path: () => window.location.pathname,
      ask,
      setTheme: (t) => applyTheme(t),
      turnOff: () => {
        turnOff = true;
      },
    };
    const add = (from: 'you' | 'luna', text: string) => lunaStore.setState((s) => ({ messages: [...s.messages, message(from, text)].slice(-40) }));
    const handle = async (text: string, voiced: boolean) => {
      const said = text.trim();
      if (!said || !alive) return;
      if (listening) rec?.stop();
      add('you', said);
      lunaStore.setState({ status: 'thinking', heard: said, draft: '' });
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
        add('luna', 'I did not catch a request there. Try one of the examples, or ask in other words.');
        idle();
        return;
      }
      add('luna', reply);
      lunaStore.setState({ reply });
      const finish = () => {
        speaking = false;
        if (turnOff) {
          lunaStore.getState().setOn(false);
          return;
        }
        if (alive) idle();
      };
      if (voiced || turnOff) {
        lunaStore.setState({ status: 'speaking' });
        speaking = true;
        speak(reply, finish);
      } else finish();
    };

    const Ctor = recognition();
    const dictate = () => {
      if (!rec || !alive) return;
      if (listening) {
        rec.stop();
        return;
      }
      if (speaking) hush();
      speaking = false;
      try {
        lunaStore.setState({ draft: '' });
        rec.start();
        listening = true;
        idle();
      } catch {
        // Already listening.
      }
    };
    if (Ctor) {
      mode = 'ready';
      rec = new Ctor();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        let text = '';
        for (let i = 0; i < e.results.length; i++) if (e.results[i][0]) text += e.results[i][0].transcript;
        lunaStore.setState({ draft: text.replace(/\s+/g, ' ').trimStart() });
      };
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') mode = 'blocked';
        else if (e.error === 'network') mode = 'offline';
        else return;
        listening = false;
        idle();
      };
      rec.onend = () => {
        listening = false;
        if (alive && !speaking && lunaStore.getState().status === 'listening') idle();
      };
    }
    lunaStore.setState({ submit: (t, voiced) => void handle(t, !!voiced), dictate, canDictate: !!Ctor, heard: null, reply: null });
    idle();
    return () => {
      alive = false;
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.abort();
      }
      hush();
      lunaStore.setState({ submit: () => {}, dictate: () => {}, status: 'off', draft: '' });
    };
  }, [on, store, ask, recognition, speak]);

  return null;
}
