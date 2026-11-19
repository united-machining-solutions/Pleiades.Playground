import { createOpenaiTranscription } from "@tanstack/ai-openai"

import { listMachines } from "@/machines/get-machines.ts"

import { chatSettings } from "./gateway.ts"

// Dictation in the chat field: the browser records, and a speech-to-text model writes down what
// was said. It runs on the server only, like the harness: the key stays here.

/**
 * The adapter of the model that writes down a recording, or null as long as the gateway lists none.
 * It speaks OpenAI's audio transcriptions at the gateway of the chat, with the first model the gateway
 * marks as one for that (`mode: audio_transcription`).
 */
export async function dictationAdapter() {
  const settings = (await chatSettings()).dictation
  if (!settings) return null
  return createOpenaiTranscription(
    settings.model as Parameters<typeof createOpenaiTranscription>[0],
    settings.apiKey,
    { baseURL: settings.baseURL },
  )
}

/**
 * The words the model is to write as the stack spells them: the names of the machines, so that
 * "P-04" is said and "P-04" is written, not "P04" or "P four". They come from the backend, as on
 * Home. Only the names and no sentence: the prompt of a transcription is meant to be in the
 * language that is spoken, and a list of names leans on none. Without the backend there are none,
 * and the model writes down what it hears. A backend that takes longer than two seconds does not
 * hold up the dictation either.
 */
export async function dictationPrompt(): Promise<string | undefined> {
  // While one speaks, what was said so far is written down every two seconds: the names are asked for once
  // a minute, not each time.
  if (kept && Date.now() - kept.at < NAMES_KEPT_MS) return kept.prompt
  const late = new Promise<undefined>((resolve) => setTimeout(resolve, 2000))
  const list = await Promise.race([listMachines(), late])
  // What a person says of a machine is its serial number or its model; the machine id carries both, and is
  // what the tools take.
  const names = list?.values?.machines.flatMap((entry) => [entry.identity.serialNumber, entry.identity.model, entry.machine]) ?? []
  const spoken = [...new Set(names.filter((name): name is string => Boolean(name)))]
  const prompt = spoken.length > 0 ? spoken.join(", ") : undefined
  // A backend that did not answer is asked again the next time.
  if (prompt !== undefined) kept = { at: Date.now(), prompt }
  return prompt
}

/** How long the names of the machines are kept for the prompt. */
const NAMES_KEPT_MS = 60_000
let kept: { at: number; prompt: string } | undefined
