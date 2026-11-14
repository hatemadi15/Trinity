import type { LunaStatus } from '@/lib/luna/store';

/** Luna's faces. Each is drawn, and each has its kaomoji, the way she would type it. */
export type LunaMood = 'sleepy' | 'happy' | 'listening' | 'thinking' | 'speaking' | 'oops';

/** What face Luna makes for what she is doing (spec 23): asleep while off, all ears while listening, and so on. */
export function lunaMood(status: LunaStatus): LunaMood {
  switch (status) {
    case 'off':
      return 'sleepy';
    case 'listening':
      return 'listening';
    case 'thinking':
      return 'thinking';
    case 'speaking':
      return 'speaking';
    case 'typing':
      return 'happy';
    case 'blocked':
    case 'offline':
      return 'oops';
  }
}

export const KAOMOJI: Record<LunaMood, string> = {
  sleepy: '(u_u) zz',
  happy: '(^-^)',
  listening: '(o.o)',
  thinking: '(-_-)…',
  speaking: '(^o^)',
  oops: '(>_<)',
};

const INK = '#16171a';
const FUR = '#eef0f3';
const SHADE = '#c9ccd2';
const BLUSH = '#7fa9ff';

/** Eyes and mouth for a mood, on the face centred at 32, 40. */
function Face({ mood }: { mood: LunaMood }) {
  const stroke = { stroke: INK, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const blinking = 'origin-center [transform-box:fill-box] animate-[blink_4.2s_ease-in-out_infinite]';
  switch (mood) {
    case 'sleepy':
      return (
        <g>
          <path d="M22 39 q3 3 6 0" {...stroke} />
          <path d="M36 39 q3 3 6 0" {...stroke} />
          <path d="M30 46 h4" {...stroke} strokeWidth={2} />
        </g>
      );
    case 'happy':
      return (
        <g>
          <path d="M22 40 l3 -3.5 l3 3.5" {...stroke} />
          <path d="M36 40 l3 -3.5 l3 3.5" {...stroke} />
          <path d="M29.5 45.5 q2.5 2 5 0" {...stroke} strokeWidth={2} />
        </g>
      );
    case 'listening':
      return (
        <g>
          <g className={blinking}>
            <circle cx="25" cy="39" r="3.1" fill={INK} />
            <circle cx="26" cy="38" r="1" fill="#fff" />
          </g>
          <g className={blinking}>
            <circle cx="39" cy="39" r="3.1" fill={INK} />
            <circle cx="40" cy="38" r="1" fill="#fff" />
          </g>
          <circle cx="32" cy="46" r="1.7" fill={INK} />
        </g>
      );
    case 'thinking':
      return (
        <g>
          <path d="M22 39 h6" {...stroke} />
          <path d="M36 38 h6" {...stroke} />
          <path d="M29.5 46 h5" {...stroke} strokeWidth={2} />
        </g>
      );
    case 'speaking':
      return (
        <g>
          <path d="M22 40 l3 -3.5 l3 3.5" {...stroke} />
          <path d="M36 40 l3 -3.5 l3 3.5" {...stroke} />
          <ellipse cx="32" cy="46.5" rx="2.6" ry="2.4" fill={INK} className="origin-center [transform-box:fill-box] animate-[talk_0.32s_ease-in-out_infinite]" />
        </g>
      );
    case 'oops':
      return (
        <g>
          <path d="M22 36.5 l5 2.5 l-5 2.5" {...stroke} />
          <path d="M42 36.5 l-5 2.5 l5 2.5" {...stroke} />
          <path d="M29 46.5 q3 -2 6 0" {...stroke} strokeWidth={2} />
          <path d="M47 30 q2 3 0 4.5 q-2 -1.5 0 -4.5z" fill={BLUSH} />
        </g>
      );
  }
}

/**
 * Luna's pet (spec 23): a small Moon rabbit, the rabbit people have seen in the Moon for two thousand years. Her face
 * follows what Luna is doing (lunaMood); she floats a little and blinks, and holds still with reduced motion. In a
 * button she wakes up while the pointer is on it (`peek`). Decorative: the button or panel around her says it in words.
 */
export function LunaPet({ mood, size = 32, peek = false, className = '' }: { mood: LunaMood; size?: number; peek?: boolean; className?: string }) {
  const perked = mood === 'listening' || mood === 'speaking';
  const droop = mood === 'sleepy' || mood === 'oops';
  const earL = droop ? -28 : perked ? -4 : -14;
  const earR = droop ? 28 : perked ? 4 : 14;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" data-mood={mood} className={`shrink-0 overflow-visible ${className}`}>
      <g className="origin-center animate-[float_3.4s_ease-in-out_infinite]">
        {/* Her ears turn with her mood: up while she listens, down while she sleeps. */}
        <g className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ transform: `rotate(${earL}deg)`, transformOrigin: '26px 26px' }}>
          <ellipse cx="25" cy="13" rx="5.6" ry="13" fill={FUR} stroke={INK} strokeWidth="1.6" />
          <ellipse cx="25" cy="14" rx="2.6" ry="8.5" fill={BLUSH} opacity="0.55" />
        </g>
        <g className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ transform: `rotate(${earR}deg)`, transformOrigin: '38px 26px' }}>
          <ellipse cx="39" cy="13" rx="5.6" ry="13" fill={FUR} stroke={INK} strokeWidth="1.6" />
          <ellipse cx="39" cy="14" rx="2.6" ry="8.5" fill={BLUSH} opacity="0.55" />
        </g>
        {/* A round, Moon-grey body with two craters for freckles. */}
        <ellipse cx="32" cy="41" rx="20" ry="17.5" fill={FUR} stroke={INK} strokeWidth="1.6" />
        <circle cx="45" cy="47" r="2.4" fill={SHADE} />
        <circle cx="48.5" cy="42" r="1.4" fill={SHADE} />
        <circle cx="18" cy="49" r="1.6" fill={SHADE} />
        <ellipse cx="20" cy="45" rx="3.4" ry="2" fill={BLUSH} opacity="0.5" />
        <ellipse cx="44" cy="45" rx="3.4" ry="2" fill={BLUSH} opacity="0.5" />
        {peek && mood === 'sleepy' ? (
          <>
            <g className="transition-opacity duration-200 group-hover:opacity-0">
              <Face mood="sleepy" />
            </g>
            <g className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <Face mood="happy" />
            </g>
          </>
        ) : (
          <Face mood={mood} />
        )}
        {mood === 'sleepy' && (
          // A drawn "z", not a letter, so the button's words stay just "Luna".
          <path d="M50 15 h6 l-6 7 h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" className={peek ? 'transition-opacity duration-200 group-hover:opacity-0' : ''} />
        )}
        {mood === 'thinking' && (
          <g fill="currentColor" opacity="0.75">
            <circle cx="50" cy="22" r="1.6" />
            <circle cx="55" cy="18" r="2" />
            <circle cx="60.5" cy="13" r="2.5" />
          </g>
        )}
        {mood === 'listening' && (
          <g fill="none" stroke={BLUSH} strokeWidth="1.8" strokeLinecap="round">
            <path d="M54 33 q3 4 0 8" />
            <path d="M58 30 q4.5 7 0 14" opacity="0.6" />
          </g>
        )}
      </g>
    </svg>
  );
}
