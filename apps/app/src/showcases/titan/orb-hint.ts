// What stands under Titan's cloud (orb.tsx): what a press on it does now.

/** What the line under the cloud hangs on. The states are those of the voice (voice/voice.ts). */
export type HintFor = {
  state: "idle" | "listening" | "thinking" | "speaking"
  started: boolean
  paused: boolean
  /** Titan listens for its name: the line says so. */
  hearsItsName: boolean
}

/** What a press on the cloud does now, and what else there is to do, in words for the person. */
export function hintFor({ state, started, paused, hearsItsName }: HintFor): { now: string; also?: string } {
  if (!started) return { now: "Tippen, um Titan zu starten" }
  if (paused) return { now: "Pause", also: "Tippen, um weiterzumachen" }
  if (state === "listening") return { now: "Ich höre zu", also: "Loslassen, wenn du fertig bist" }
  if (state === "thinking") return { now: "Moment …" }
  // A tap is enough to make Titan fall silent; held, the press goes on into the next question.
  if (state === "speaking") return { now: "Tippen zum Unterbrechen", also: "oder gedrückt halten und weiterfragen" }
  return { now: "Gedrückt halten und sprechen", also: hearsItsName ? "oder „Hey Titan“ sagen" : undefined }
}
