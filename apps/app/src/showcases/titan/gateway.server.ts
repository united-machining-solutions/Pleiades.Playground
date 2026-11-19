// Which models of the gateway Titan takes. Titan has no model of its own and no address of its own: it
// asks the gateway of the chat (LLM_BASE_URL, LLM_API_KEY, docs/adr/0010) what it lists, and takes
//
// - for the conversation a chat model,
// - for listening the model of dictation (chat/gateway.ts),
// - for speaking a model of the mode "audio_speech".
//
// A model whose name begins with "titan/" is meant for Titan and wins for its mode: the admin of a
// gateway gives Titan a voice of its own that way (`titan/tom`), or a chat model set up to answer at
// once (`titan/chat`). Without one, the first model of the mode answers.

type Env = Readonly<Record<string, string | undefined>>

export type TitanModels = {
  baseURL: string
  apiKey: string
  /** The model Titan talks with, or undefined: then Titan cannot answer. */
  chat: string | undefined
  /** The model that speaks, or undefined: then the browser speaks, or nobody. */
  speech: string | undefined
}

/** A model meant for Titan, by its name at the gateway. */
const FOR_TITAN = /^titan\//i

/** The model of a mode: the one meant for Titan if there is one, else the first. */
export function pick(models: ReadonlyArray<string>): string | undefined {
  return models.find((model) => FOR_TITAN.test(model)) ?? models[0]
}

/** The models of the answer of GET /models, by mode. A model without a mode is one for chat, as in chat/models.ts. */
export function listed(body: unknown): { chat: Array<string>; speech: Array<string> } {
  const found = { chat: [] as Array<string>, speech: [] as Array<string> }
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) return found
  for (const entry of data as Array<{ id?: unknown; mode?: unknown } | null>) {
    if (typeof entry?.id !== "string" || entry.id.trim() === "") continue
    const mode = typeof entry.mode === "string" ? entry.mode : "chat"
    if (mode === "chat") found.chat.push(entry.id.trim())
    if (mode === "audio_speech") found.speech.push(entry.id.trim())
  }
  return found
}

/**
 * What a model is sent along so that it answers at once instead of thinking first: a spoken answer that
 * begins after ten seconds of thought is no conversation. A model meant for Titan is set up at the
 * gateway and gets nothing; of the others, the two families the hackathon gateway offers are known here.
 *
 * For Haiku it is `thinking: disabled`. `reasoning_effort: "none"` does not do it: measured through
 * LiteLLM with Titan's instructions, Haiku still thought for 600 to 750 tokens, unseen, and its first
 * word came after 3.2 to 3.9 s instead of 0.5 to 0.6 s. A model set up for Titan at the gateway needs the
 * same in its `litellm_params`.
 */
export function atOnce(model: string): Record<string, unknown> {
  if (FOR_TITAN.test(model)) return {}
  if (/haiku/i.test(model)) return { thinking: { type: "disabled" } }
  if (/qwen/i.test(model)) return { chat_template_kwargs: { enable_thinking: false } }
  return {}
}

const RETRY_AFTER_MS = 30_000
let kept: { key: string; models: Promise<TitanModels | undefined>; until: number } | undefined

/** Titan's models, asked once and kept; a gateway that did not answer, or has no chat model, is asked again after half a minute. */
export function titanModels(env: Env = process.env): Promise<TitanModels | undefined> {
  const key = JSON.stringify([env.LLM_BASE_URL, env.LLM_API_KEY])
  if (kept && kept.key === key && Date.now() < kept.until) return kept.models
  const models = ask(env)
  const mine = { key, models, until: Infinity }
  kept = mine
  void models.then((found) => {
    // Also a gateway that answered without a model for chat: it may list one a moment later.
    if (found?.chat === undefined) mine.until = Date.now() + RETRY_AFTER_MS
  })
  return models
}

async function ask(env: Env): Promise<TitanModels | undefined> {
  if (!env.LLM_BASE_URL) return undefined
  const baseURL = env.LLM_BASE_URL.replace(/\/+$/, "")
  const apiKey = env.LLM_API_KEY || "not-needed"
  try {
    const answer = await fetch(`${baseURL}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(2_000) })
    if (!answer.ok) return undefined
    const { chat, speech } = listed(await answer.json())
    return { baseURL, apiKey, chat: pick(chat), speech: pick(speech) }
  } catch {
    return undefined
  }
}
