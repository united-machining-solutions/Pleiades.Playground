import { createOpenaiTranscription } from "@tanstack/ai-openai"

import { dictationSettings } from "./models.ts"

// Dictation in the chat field: the browser records, and a speech-to-text model writes down what
// was said. It runs on the server only, like the harness: the key stays here.

/**
 * The adapter of the model that writes down a recording, or null as long as none is configured.
 * Both blocks that can name one speak OpenAI's audio transcriptions; the other endpoint only has an
 * address of its own. As for the chat, the name comes from the settings, not from the list the
 * adapter knows: a name the endpoint does not have fails at the first recording, with its own words.
 */
export function dictationAdapter() {
  const settings = dictationSettings(process.env)
  if (!settings) return null
  return createOpenaiTranscription(
    settings.model as Parameters<typeof createOpenaiTranscription>[0],
    settings.apiKey,
    settings.baseURL ? { baseURL: settings.baseURL } : {},
  )
}
