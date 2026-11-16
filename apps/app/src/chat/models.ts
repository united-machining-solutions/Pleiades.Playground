// Which language models the chat offers. They come from one endpoint that speaks OpenAI's chat
// completions: a gateway such as LiteLLM, which reaches the providers behind it, the API of OpenAI,
// or a model server on one's own computer.

export type ModelSettings = { baseURL: string; apiKey: string; models: Array<string> }

/** "a, b" names the models a and b. */
function names(value: string | undefined): Array<string> {
  return (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")
}

/** The models LLM_MODELS names; none where it is empty. */
export function namedModels(env: Readonly<Record<string, string | undefined>>): Array<string> {
  return names(env.LLM_MODELS)
}

/**
 * The chat models in the answer of an endpoint's GET /models, in its order. A gateway such as LiteLLM
 * says of a model what it is for (`mode`): a model whose mode it names and that is not "chat", an
 * embedding or a speech-to-text model, is left out. A model without a mode stays, for a server that
 * does not say and for a model the gateway knows nothing about. So does the speech-to-text model of
 * dictation, if the gateway does not say what it is: it is never offered for the chat.
 */
export function chatModelsOf(body: unknown, transcriptionModel?: string): Array<string> {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return []
  const models = data.flatMap((entry: { id?: unknown; mode?: unknown } | null) => {
    if (typeof entry?.id !== "string" || entry.id.trim() === "") return []
    if (typeof entry.mode === "string" && entry.mode !== "chat") return []
    return [entry.id.trim()]
  })
  const transcription = transcriptionModel?.trim()
  return [...new Set(models)].filter((name) => name !== transcription)
}

/**
 * The endpoint and its chat models, or undefined: then the chat has none. The models are those of
 * LLM_MODELS, or, where that is empty, those the endpoint listed (`listed`, see chatModelsOf).
 */
export function modelSettings(
  env: Readonly<Record<string, string | undefined>>,
  listed: ReadonlyArray<string> = [],
): ModelSettings | undefined {
  if (!env.LLM_BASE_URL) return undefined
  const named = names(env.LLM_MODELS)
  const models = [...new Set(named.length > 0 ? named : listed)]
  if (models.length === 0) return undefined
  // A local model server often wants no key, but the request needs one.
  return { baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY || "not-needed", models }
}

/**
 * What the settings lack that were begun: "LLM_MODELS is set, LLM_BASE_URL is empty". It names
 * settings and never a value. An empty LLM_MODELS is a gap only where the endpoint listed no chat
 * model either (`listed`).
 */
export function settingGaps(
  env: Readonly<Record<string, string | undefined>>,
  listed: ReadonlyArray<string> = [],
): Array<string> {
  if (env.LLM_BASE_URL) {
    return names(env.LLM_MODELS).length === 0 && listed.length === 0
      ? ["LLM_BASE_URL is set, LLM_MODELS is empty, and the endpoint lists no chat model under /models"]
      : []
  }
  return ["LLM_API_KEY", "LLM_MODELS", "LLM_TRANSCRIPTION_MODEL"]
    .filter((name) => (env[name] ?? "").trim() !== "")
    .map((name) => `${name} is set, LLM_BASE_URL is empty`)
}

/** The names the chat offers, in the order of the settings. The first one answers until a chat picks another. */
export function modelNames(settings: ModelSettings | undefined): Array<string> {
  return settings?.models ?? []
}

/**
 * The model that writes down what is said into the chat field, at the same endpoint, if it speaks
 * OpenAI's audio transcriptions, as a gateway, OpenAI and a local speech server do.
 */
export type DictationSettings = { model: string; apiKey: string; baseURL: string }

/** Where dictation runs, or undefined: then the chat field has no microphone. */
export function dictationSettings(env: Readonly<Record<string, string | undefined>>): DictationSettings | undefined {
  const model = env.LLM_TRANSCRIPTION_MODEL?.trim()
  if (!env.LLM_BASE_URL || !model) return undefined
  // As for the chat: a local server often wants no key, but the request needs one.
  return { model, apiKey: env.LLM_API_KEY || "not-needed", baseURL: env.LLM_BASE_URL }
}
