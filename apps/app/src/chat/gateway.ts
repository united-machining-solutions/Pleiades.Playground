import { dictationSettings, modelSettings, modelsOf, settingGaps } from "./models.ts"
import type { DictationSettings, ListedModels, ModelSettings } from "./models.ts"

// What the gateway offers, as one snapshot. The harness, dictation and the chat panel read the same
// one, so the panel offers exactly what the harness has. A list that came with a model for chat is kept
// until the server restarts, as the settings are. One that did not come, or came without one, is asked
// for again after half a minute, not on every page, and the panel says why.

export type ChatSettings = {
  settings: ModelSettings | undefined
  dictation: DictationSettings | undefined
  gaps: Array<string>
}

type Env = Readonly<Record<string, string | undefined>>

const RETRY_AFTER_MS = 30_000
const TIMEOUT_MS = 2_000
const none: ListedModels = { chat: [], transcription: [] }

const kept = new Map<string, { chat: Promise<ChatSettings>; until: number }>()

/** The snapshot for these settings. Callers that ask at the same time share one request to the gateway. */
export function chatSettings(env: Env = process.env, clock: () => number = Date.now): Promise<ChatSettings> {
  const key = JSON.stringify([env.LLM_BASE_URL, env.LLM_API_KEY])
  const entry = kept.get(key)
  if (entry && clock() < entry.until) return entry.chat
  const chat = take(env).then((snapshot) => {
    const failed = snapshot.settings === undefined
    kept.set(key, { chat: Promise.resolve(snapshot), until: failed ? clock() + RETRY_AFTER_MS : Infinity })
    return snapshot
  })
  kept.set(key, { chat, until: Infinity })
  return chat
}

async function take(env: Env): Promise<ChatSettings> {
  const listed = env.LLM_BASE_URL ? await ask(env.LLM_BASE_URL, env.LLM_API_KEY) : none
  if (typeof listed === "string") return { settings: undefined, dictation: undefined, gaps: [listed] }
  return {
    settings: modelSettings(env, listed),
    dictation: dictationSettings(env, listed),
    gaps: settingGaps(env, listed),
  }
}

/** The models the gateway lists, or why there are none, by the names of the settings and never a value. */
async function ask(baseURL: string, apiKey: string | undefined): Promise<ListedModels | string> {
  let problem: string
  try {
    const response = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.ok) return modelsOf(await response.json())
    problem = `answered ${response.status}`
  } catch (error) {
    problem = `failed (${(error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name})`
  }
  const gap = `GET /models of the gateway at LLM_BASE_URL ${problem}`
  console.warn(`${gap}.`)
  return gap
}
