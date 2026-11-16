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
  const late = new Promise<undefined>((resolve) => setTimeout(resolve, 2000))
  const list = await Promise.race([listMachines(), late])
  const names = list?.values?.machines.map((entry) => entry.machine) ?? []
  return names.length > 0 ? names.join(", ") : undefined
}
