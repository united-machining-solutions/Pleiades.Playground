import { chatModelsOf, modelSettings, namedModels, settingGaps } from "./models.ts"
import type { ModelSettings } from "./models.ts"

// The settings of the chat as one snapshot. The harness and the chat panel read the same one, so the
// panel offers exactly the models the harness has. Where LLM_MODELS is empty, the snapshot holds the
// chat models the endpoint lists under GET /models. A list that came is kept until the server
// restarts, as the settings are. One that did not come is asked for again after half a minute, not on
// every page, and the panel says why it did not come.

export type ChatSettings = { settings: ModelSettings | undefined; gaps: Array<string> }

type Env = Readonly<Record<string, string | undefined>>

const RETRY_AFTER_MS = 30_000
const TIMEOUT_MS = 2_000

const kept = new Map<string, { chat: Promise<ChatSettings>; until: number }>()

/** The snapshot for these settings. Callers that ask at the same time share one request to the endpoint. */
export function chatSettings(env: Env = process.env, clock: () => number = Date.now): Promise<ChatSettings> {
  const key = JSON.stringify([env.LLM_BASE_URL, env.LLM_API_KEY, env.LLM_MODELS, env.LLM_TRANSCRIPTION_MODEL])
  const entry = kept.get(key)
  if (entry && clock() < entry.until) return entry.chat
  const chat = take(env).then(({ chat, failed }) => {
    kept.set(key, { chat: Promise.resolve(chat), until: failed ? clock() + RETRY_AFTER_MS : Infinity })
    return chat
  })
  kept.set(key, { chat, until: Infinity })
  return chat
}

async function take(env: Env): Promise<{ chat: ChatSettings; failed: boolean }> {
  if (!env.LLM_BASE_URL || namedModels(env).length > 0) {
    return { chat: { settings: modelSettings(env), gaps: settingGaps(env) }, failed: false }
  }
  const listed = await ask(env.LLM_BASE_URL, env.LLM_API_KEY, env.LLM_TRANSCRIPTION_MODEL)
  if (typeof listed === "string") return { chat: { settings: undefined, gaps: [listed] }, failed: true }
  return { chat: { settings: modelSettings(env, listed), gaps: settingGaps(env, listed) }, failed: listed.length === 0 }
}

/** The chat models the endpoint lists, or why there are none, by the names of the settings and never a value. */
async function ask(baseURL: string, apiKey: string | undefined, transcriptionModel: string | undefined) {
  let problem: string
  try {
    const response = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.ok) return chatModelsOf(await response.json(), transcriptionModel)
    problem = `answered ${response.status}`
  } catch (error) {
    problem = `failed (${(error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name})`
  }
  const gap = `LLM_MODELS is empty, and GET /models of LLM_BASE_URL ${problem}`
  console.warn(`${gap}.`)
  return gap
}
