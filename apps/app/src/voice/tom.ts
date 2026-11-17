// The voice of Tom for Titan: a service on this computer speaks German in Tom's voice (apps/titan-voice),
// reached through the server route /api/speak. Tom agreed to it; his recording stays on that computer.
//
// It speaks one sentence at a time, like Piper in piper.ts: `tom.predict(sentence)` gives a wav, so the
// first sentence sounds while the next is made.

/** The longest text the service takes at once; a sentence is much shorter. */
export const MAX_SENTENCE = 1000

/** The text to speak, trimmed, or nothing if there is none or it is too long. */
export function speakableText(text: unknown): string | undefined {
  if (typeof text !== "string") return undefined
  const trimmed = text.replace(/\s+/g, " ").trim()
  if (trimmed === "" || trimmed.length > MAX_SENTENCE) return undefined
  return trimmed
}

let asking: Promise<boolean> | undefined

/**
 * Whether the voice of Tom is there. Asked once and kept; after a failure, or while the service is not
 * ready, the next call asks again.
 */
export function tomAvailable(): Promise<boolean> {
  asking ??= fetch("/api/speak")
    .then(async (answer) => answer.ok && ((await answer.json()) as { available?: boolean }).available === true)
    .catch(() => false)
    .then((available) => {
      if (!available) asking = undefined
      return available
    })
  return asking
}

/** One sentence in the voice of Tom, as a wav. */
export async function speakAsTom(text: string): Promise<Blob> {
  const sentence = speakableText(text)
  if (sentence === undefined) throw new Error("Nothing to say, or more than a sentence")
  const answer = await fetch("/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: sentence }),
  })
  if (!answer.ok) {
    asking = undefined
    const { error } = (await answer.json().catch(() => ({}))) as { error?: string }
    throw new Error(error ?? `The voice of Tom answered ${answer.status}`)
  }
  return answer.blob()
}

/** The shape of a Piper session (`PiperSession` in piper.ts), so voice.ts can play Tom the same way. */
export const tom: { predict: (sentence: string) => Promise<Blob> } = { predict: speakAsTom }
