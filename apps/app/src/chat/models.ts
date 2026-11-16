// Which language models the chat offers. The settings name them in up to three blocks, and every
// block is optional: Anthropic, OpenAI, and any other endpoint that speaks OpenAI's chat
// completions, such as a local model server or a gateway. The blocks count in that order.

export type ModelSettings = {
  anthropic?: { apiKey: string; models: Array<string> }
  openai?: { apiKey: string; models: Array<string> }
  compatible?: { baseURL: string; apiKey: string; models: Array<string> }
}

/** "a, b" names the models a and b. */
function names(value: string | undefined): Array<string> {
  return (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")
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
 * A block counts only if it is complete: what it needs to sign in, and at least one model. The block of
 * the other endpoint takes the names of LLM_MODELS, or, where that is empty, the chat models the
 * endpoint listed (`listed`, see chatModelsOf).
 */
export function modelSettings(
  env: Readonly<Record<string, string | undefined>>,
  listed: ReadonlyArray<string> = [],
): ModelSettings {
  const settings: ModelSettings = {}
  const anthropic = names(env.ANTHROPIC_MODELS)
  if (env.ANTHROPIC_API_KEY && anthropic.length > 0) {
    settings.anthropic = { apiKey: env.ANTHROPIC_API_KEY, models: anthropic }
  }
  const openai = names(env.OPENAI_MODELS)
  if (env.OPENAI_API_KEY && openai.length > 0) {
    settings.openai = { apiKey: env.OPENAI_API_KEY, models: openai }
  }
  const named = names(env.LLM_MODELS)
  const compatible = named.length > 0 ? named : [...listed]
  if (env.LLM_BASE_URL && compatible.length > 0) {
    // A local model server often wants no key, but the request needs one.
    settings.compatible = { baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY || "not-needed", models: compatible }
  }
  return settings
}

/**
 * What a block lacks that was begun: "ANTHROPIC_API_KEY is set, ANTHROPIC_MODELS is empty". It names
 * settings and never a value. A line of model names without its key is not a gap: the names have
 * defaults, and a block without a key is simply not used. An empty LLM_MODELS is a gap only where the
 * endpoint listed no chat model either (`listed`).
 */
export function settingGaps(
  env: Readonly<Record<string, string | undefined>>,
  listed: ReadonlyArray<string> = [],
): Array<string> {
  const gaps: Array<string> = []
  const gap = (set: string, empty: string) => gaps.push(`${set} is set, ${empty} is empty`)
  if (env.ANTHROPIC_API_KEY && names(env.ANTHROPIC_MODELS).length === 0) gap("ANTHROPIC_API_KEY", "ANTHROPIC_MODELS")
  if (env.OPENAI_API_KEY && names(env.OPENAI_MODELS).length === 0) gap("OPENAI_API_KEY", "OPENAI_MODELS")
  const compatible = names(env.LLM_MODELS)
  if (env.LLM_BASE_URL && compatible.length === 0 && listed.length === 0) {
    gaps.push("LLM_BASE_URL is set, LLM_MODELS is empty, and the endpoint lists no chat model under /models")
  }
  if (!env.LLM_BASE_URL && compatible.length > 0) gap("LLM_MODELS", "LLM_BASE_URL")
  return gaps
}

/**
 * The names the chat offers: block by block, Anthropic's first, each block in the order of its
 * setting. The first one answers until a chat picks another.
 */
export function modelNames(settings: ModelSettings): Array<string> {
  return [
    ...new Set([
      ...(settings.anthropic?.models ?? []),
      ...(settings.openai?.models ?? []),
      ...(settings.compatible?.models ?? []),
    ]),
  ]
}

/**
 * The model that writes down what is said into the chat field, and where it runs. Two blocks can
 * name one, next to their key: OpenAI, and the other endpoint if it speaks OpenAI's audio
 * transcriptions, as a gateway or a local speech server does. Anthropic has no such model. The
 * first complete block counts, in the order of the blocks of the chat.
 */
export type DictationSettings = { model: string; apiKey: string; baseURL?: string }

/** Where dictation runs, or undefined: then the chat field has no microphone. */
export function dictationSettings(env: Readonly<Record<string, string | undefined>>): DictationSettings | undefined {
  const openai = env.OPENAI_TRANSCRIPTION_MODEL?.trim()
  if (env.OPENAI_API_KEY && openai) return { model: openai, apiKey: env.OPENAI_API_KEY }
  const compatible = env.LLM_TRANSCRIPTION_MODEL?.trim()
  if (env.LLM_BASE_URL && compatible) {
    // As for the chat: a local server often wants no key, but the request needs one.
    return { model: compatible, apiKey: env.LLM_API_KEY || "not-needed", baseURL: env.LLM_BASE_URL }
  }
  return undefined
}
