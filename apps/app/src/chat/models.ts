// Which language models the chat offers, and which one writes down dictation. They come from one
// LiteLLM gateway, which reaches Anthropic, OpenAI and models of one's own behind one address and one
// key. The app takes the models the gateway lists under GET /models, in its order.

type Env = Readonly<Record<string, string | undefined>>

export type ModelSettings = { baseURL: string; apiKey: string; models: Array<string> }

/** The model that writes down what is said into the chat field, at the gateway of the chat. */
export type DictationSettings = { baseURL: string; apiKey: string; model: string }

/** What the gateway lists, by what each model is for. */
export type ListedModels = { chat: Array<string>; transcription: Array<string> }

/**
 * The models in the answer of the gateway's GET /models, in its order. LiteLLM says of a model what it
 * is for (`mode`). A model for chat is one whose mode is "chat", or that has none: the gateway knows
 * nothing about a model of one's own until its admin sets the mode, and a model of one's own is what
 * a gateway in the room is there for. A model for dictation is one whose mode is "audio_transcription".
 * Every other mode, an embedding model for example, is left out.
 */
export function modelsOf(body: unknown): ListedModels {
  const listed: ListedModels = { chat: [], transcription: [] }
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return listed
  for (const entry of data as Array<{ id?: unknown; mode?: unknown } | null>) {
    if (typeof entry?.id !== "string" || entry.id.trim() === "") continue
    const id = entry.id.trim()
    const mode = typeof entry.mode === "string" ? entry.mode : undefined
    const list = mode === undefined || mode === "chat" ? listed.chat : mode === "audio_transcription" ? listed.transcription : undefined
    if (list && !list.includes(id)) list.push(id)
  }
  return listed
}

/** The gateway: its address and its key. A request needs a key, even where the gateway wants none. */
function gatewayOf(env: Env): { baseURL: string; apiKey: string } | undefined {
  return env.LLM_BASE_URL ? { baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY || "not-needed" } : undefined
}

/** The gateway and its chat models, or undefined: then the chat has none. */
export function modelSettings(env: Env, listed: ListedModels): ModelSettings | undefined {
  const gateway = gatewayOf(env)
  return gateway && listed.chat.length > 0 ? { ...gateway, models: [...listed.chat] } : undefined
}

/** Where dictation runs: the first model of the gateway for it, or undefined: then the field has no microphone. */
export function dictationSettings(env: Env, listed: ListedModels): DictationSettings | undefined {
  const gateway = gatewayOf(env)
  const [model] = listed.transcription
  return gateway && model !== undefined ? { ...gateway, model } : undefined
}

/**
 * What the settings lack, by the names of the settings and never a value: "LLM_API_KEY is set,
 * LLM_BASE_URL is empty", or a gateway that lists no model for chat.
 */
export function settingGaps(env: Env, listed: ListedModels): Array<string> {
  if (!env.LLM_BASE_URL) return env.LLM_API_KEY ? ["LLM_API_KEY is set, LLM_BASE_URL is empty"] : []
  return listed.chat.length === 0 ? ["The gateway at LLM_BASE_URL lists no model for chat under /models"] : []
}

/** The names the chat offers, in the order of the gateway. The first one answers until a chat picks another. */
export function modelNames(settings: ModelSettings | undefined): Array<string> {
  return settings?.models ?? []
}
