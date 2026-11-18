// The voice of Titan: the speech model of the gateway speaks a sentence, reached through the server route
// /titan/api/speak. Which voice that is, the gateway says (showcases/titan/gateway.server.ts): at the
// hackathon a voice trained for Titan, elsewhere whatever speech model the gateway lists first.
//
// It speaks one sentence at a time: `gatewayVoice.predict(sentence)` gives a wav, so the first sentence
// sounds while the next is made.

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
 * Whether the gateway has a voice. Asked once and kept; after a failure, or while there is none,
 * the next call asks again.
 */
export function speechAvailable(): Promise<boolean> {
  asking ??= fetch("/titan/api/speak")
    .then(async (answer) => answer.ok && ((await answer.json()) as { available?: boolean }).available === true)
    .catch(() => false)
    .then((available) => {
      if (!available) asking = undefined
      return available
    })
  return asking
}

/** One sentence in the voice of the gateway, as a wav. */
export async function speakSentence(text: string): Promise<Blob> {
  const sentence = speakableText(text)
  if (sentence === undefined) throw new Error("Nothing to say, or more than a sentence")
  const answer = await fetch("/titan/api/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: sentence }),
  })
  if (!answer.ok) {
    asking = undefined
    const { error } = (await answer.json().catch(() => ({}))) as { error?: string }
    throw new Error(error ?? `The voice answered ${answer.status}`)
  }
  return answer.blob()
}

/** The voice as voice.ts takes one: a sentence in, its sound out. */
export const gatewayVoice: { predict: (sentence: string) => Promise<Blob> } = { predict: speakSentence }
