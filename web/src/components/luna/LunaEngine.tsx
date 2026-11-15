'use client';
import { useEffect, useRef } from 'react';
import { useStore, type StoreApi } from 'zustand';
import { askLuna } from '@/lib/ai/client';
import { useNavigate } from '@/lib/hooks/useNavigate';
import { plannerShowing } from '@/lib/links';
import { parseCommand } from '@/lib/luna/commands';
import { RECORDING_MAX_MS } from '@/lib/luna/limits';
import { browserRecorder, type LunaRecorder, type Recording } from '@/lib/luna/recorder';
import { runCommand, type LunaDeps } from '@/lib/luna/run';
import { recognitionCtor, type Recognition, type RecognitionCtor } from '@/lib/luna/speech';
import { lunaStore, message, type LunaMessage } from '@/lib/luna/store';
import { geminiVisit } from '@/lib/luna/visit';
import { lunaVoice } from '@/lib/luna/voice';
import { exploreStore, type ExploreState } from '@/lib/store/explore';
import { scenarioStore } from '@/lib/store/scenarios';
import { applyTheme } from '@/lib/theme';

/** How long after the browser ends its recognition (it does after a silence) Luna listens again, in ms. */
const RESTART_MS = 300;
/** The lines of conversation kept, from page to page. */
const KEPT = 40;
/** Her answer to typed words that ask for nothing she can do. */
export const NOT_CAUGHT = 'I did not catch a request there. Try one of the examples, or ask in other words.';
/** Her answers when a recording gives no words (spec 22.5). */
export const NOT_TRANSCRIBED = 'I could not make out the recording just now. Press the microphone to try again, or type to me.';
export const NOTHING_HEARD = 'I did not hear any words. Press the microphone and try again, or type to me.';
const TOO_MANY = 'Too many requests just now: wait a moment, then press the microphone again, or type to me.';
const TOO_LONG = 'That recording was too long for me: try a shorter request.';

/**
 * Luna's engine (spec 22), once for the whole app, in the root layout, so she keeps listening from page to page and her
 * conversation lasts (spec 23.2). While she is on, the browser's speech recognition runs (continuous, English); each
 * phrase it hears to the end is a command (parseCommand) carried out on the page (runCommand), and her reply is said
 * aloud (in Gemini's voice where the app may use it, else the browser's: lunaVoice, spec 22.5), with the recognition
 * stopped meanwhile so she never hears herself. With the switch in her panel off ("Say
 * replies aloud", `lunaStore.voice`) no reply is said aloud: it shows in the conversation only, and the listening goes
 * on; turned off while she speaks, she stops at once. Typed words (`lunaStore.submit`) are commands too: her only way
 * in without voice input or with the microphone blocked. Each exchange goes into her conversation as two lines; a stray
 * word heard in the room is let go without one, while typed words always get an answer. Her panel's microphone pauses
 * the listening and starts it again (`lunaStore.toggleMic`). Where the browser has no speech recognition (Firefox, some
 * Safari), the microphone records a phrase at a press and sends it at the next, or after 15 s, for Gemini to write
 * down (/api/transcribe); the words then go to her commands as a heard phrase does (`lunaStore.pressToTalk`, spec
 * 22.5): never in cached mode, and not again in the visit once the server says it cannot. Off, nothing listens.
 * Renders nothing: her button and panel are LunaButton, and her 3D self LunaDock.
 */
export function LunaEngine({
  store = exploreStore,
  ask = askLuna,
  recognition = recognitionCtor,
  recorder = browserRecorder,
  speak = lunaVoice.speak,
  hush = lunaVoice.hush,
  prime = lunaVoice.prime,
  navigate,
}: {
  store?: StoreApi<ExploreState>;
  ask?: LunaDeps['ask'];
  recognition?: () => RecognitionCtor | null;
  /** Her microphone where the browser has no speech recognition: records a phrase, and has it written down. */
  recorder?: LunaRecorder;
  /** Says a reply; `gemini` when the app may use Gemini's voice (not cached mode). */
  speak?: (text: string, done: () => void, opts?: { gemini?: boolean }) => boolean;
  /** Stops whatever she is saying. */
  hush?: () => void;
  /** Readies her voice during a press (lunaStore.prime). */
  prime?: () => void;
  navigate?: (href: string) => void;
}) {
  const routerNavigate = useNavigate();
  const go = useRef(navigate ?? routerNavigate);
  useEffect(() => {
    go.current = navigate ?? routerNavigate;
  });
  const on = useStore(lunaStore, (s) => s.on);

  // Her buttons ready her voice during the press that turns her on.
  useEffect(() => {
    lunaStore.setState({ prime });
    return () => lunaStore.setState({ prime: () => {} });
  }, [prime]);

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
    // Where the browser has no speech recognition: the phrase being recorded, and whether one is being written down.
    let take: Recording | null = null;
    let starting = false;
    let sending = false;
    // press: her microphone records a phrase at a press (spec 22.5).
    let mode: 'listening' | 'press' | 'typing' | 'blocked' | 'offline' = 'typing';
    const idle = () => lunaStore.setState({ status: take ? 'listening' : mode === 'press' || (mode === 'listening' && paused) ? 'ready' : mode });
    // Gemini's help (her voice, her ears where the browser has none) is never asked for in cached mode.
    const live = () => store.getState().aiMode !== 'cached';
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
      search: () => window.location.search,
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
        reply = await runCommand(parseCommand(said, store.getState().sites, { planning: plannerShowing(window.location.pathname, window.location.search) }), deps, said);
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
      respond(reply);
    };
    // Her reply, into the conversation and, with the switch on, said aloud.
    const respond = (reply: string) => {
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
      speak(
        reply,
        () => {
          if (mine === utterance) over();
        },
        // Never Gemini's voice in cached mode: the offline build or ?demo=1.
        { gemini: live() },
      );
    };
    // The switch turned off while she speaks: she stops at once.
    const unsubscribe = lunaStore.subscribe((s, was) => {
      if (s.voice || !was.voice || !speaking) return;
      utterance++;
      hush();
      over();
    });

    const Ctor = recognition();
    const canRecord = () => live() && !geminiVisit.unavailable() && recorder.supported();
    // Without speech recognition, and where the app may ask Gemini, her microphone records a phrase at a press.
    const pressing = !Ctor && canRecord();
    // The microphone goes, without a word: she takes typed words, as where the browser cannot listen at all.
    const toTyping = () => {
      mode = 'typing';
      lunaStore.setState({ canListen: false, pressToTalk: false });
      if (!speaking) idle();
    };
    // A press: starts recording a phrase, or stops it and has it written down, then acts on it as on a heard phrase.
    const record = async () => {
      if (starting || sending) return;
      if (take) {
        take.stop();
        return;
      }
      if (!canRecord()) return toTyping();
      if (speaking) {
        // She stops talking to listen.
        utterance++;
        speaking = false;
        hush();
      }
      starting = true;
      let t: Recording;
      try {
        t = await recorder.start(RECORDING_MAX_MS);
      } catch {
        starting = false;
        if (!alive) return;
        mode = 'blocked';
        idle();
        return;
      }
      starting = false;
      if (!alive) return t.cancel();
      mode = 'press';
      take = t;
      idle();
      const blob = await t.done;
      if (take === t) take = null;
      if (!alive) return;
      if (!blob?.size) return idle();
      sending = true;
      lunaStore.setState({ status: 'thinking' });
      const r = await recorder.transcribe(blob);
      sending = false;
      if (!alive) return;
      if ('text' in r) {
        if (r.text.trim()) void handle(r.text, false);
        else respond(NOTHING_HEARD);
        return;
      }
      if (r.error === 'unavailable') {
        geminiVisit.markUnavailable();
        return toTyping();
      }
      respond(r.error === 'busy' ? TOO_MANY : r.error === 'too-long' ? TOO_LONG : NOT_TRANSCRIBED);
    };
    const toggleMic = () => {
      if (!alive) return;
      if (pressing) {
        void record();
        return;
      }
      if (!rec) return;
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
    lunaStore.setState({ submit: (t) => void handle(t, true), toggleMic, canListen: !!Ctor || pressing, pressToTalk: pressing, heard: null, reply: null });
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
    } else if (pressing) {
      mode = 'press';
      // Asked once each time she is turned on: where the server cannot write down a recording, the microphone goes.
      void recorder.available().then((ok) => {
        if (!alive || ok !== false) return;
        geminiVisit.markUnavailable();
        if (!take && !sending) toTyping();
      });
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
      take?.cancel();
      take = null;
      hush();
      lunaStore.setState({ submit: () => {}, toggleMic: () => {}, status: 'off' });
    };
  }, [on, store, ask, recognition, recorder, speak, hush]);

  return null;
}
