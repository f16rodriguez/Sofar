// Recording in a browser, for the interview and the daily question alike.
//
// Client-only: it touches MediaRecorder and getUserMedia, and nothing on the
// server imports it.

/**
 * What this browser can actually record. Safari has carried MediaRecorder
 * with different containers across versions, and asking for one it does not
 * have throws — which reads, on screen, as "no microphone", sending someone
 * to the keyboard who had a working microphone all along. The first supported
 * container wins; undefined lets the browser choose its own.
 */
export function supportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=opus",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

/** What went wrong reaching the microphone, said plainly. */
export function micProblem(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Your browser is blocking the microphone. Allow it in the address bar, or type your answer instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone found. You can type your answer instead.";
  }
  return "The microphone didn't start. Try again, or type your answer instead.";
}

/** The file name for a recording, matching what it actually holds. */
export function fileNameFor(mimeType: string): string {
  const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
  return `answer.${ext}`;
}

/** 32 kbps where the browser allows it (SPEC §3.3): an hour is about 14 MB. */
export const AUDIO_BITS_PER_SECOND = 32000;
