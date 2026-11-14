/** The limits of Luna's two voice routes, which her browser side keeps to as well (spec 22.5). */

/** The longest reply sent for Gemini's voice, in characters; /api/speak refuses longer, and she says those herself. */
export const SPEECH_MAX_CHARS = 500;

/** How long one recording may last, in ms: press to start, press again to send, or it sends itself then. */
export const RECORDING_MAX_MS = 15_000;

/** The largest recording /api/transcribe takes, in bytes: 15 s of 16 kHz mono WAV is 480 KB. */
export const AUDIO_MAX_BYTES = 1_000_000;

/** The longest transcript passed on to her commands, in characters (15 s of speech is well under). */
export const TRANSCRIPT_MAX_CHARS = 500;
