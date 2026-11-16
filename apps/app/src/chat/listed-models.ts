import { chatModelsOf } from "./models.ts"

// Where LLM_MODELS is empty, the chat takes the chat models the other endpoint lists under GET
// /models. They are asked for once: a list that came is kept until the server restarts, as the
// settings are. A list that did not come, because the endpoint was away or refused the key, is asked
// for again the next time.

let kept: Promise<Array<string>> | undefined

/** The chat models the other endpoint lists, or none where LLM_MODELS names them or no endpoint is set. */
export function listedModels(env: Readonly<Record<string, string | undefined>> = process.env): Promise<Array<string>> {
  const baseURL = env.LLM_BASE_URL
  if (!baseURL || (env.LLM_MODELS ?? "").replaceAll(",", "").trim() !== "") return Promise.resolve([])
  kept ??= ask(baseURL, env.LLM_API_KEY, env.LLM_TRANSCRIPTION_MODEL).then((models) => {
    if (models.length === 0) kept = undefined
    return models
  })
  return kept
}

async function ask(baseURL: string, apiKey: string | undefined, transcriptionModel: string | undefined) {
  try {
    const response = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      console.warn(`LLM_MODELS is empty, and GET /models of LLM_BASE_URL answered ${response.status}.`)
      return []
    }
    return chatModelsOf(await response.json(), transcriptionModel)
  } catch (error) {
    // The message names the cause, never the key.
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).name
    console.warn(`LLM_MODELS is empty, and GET /models of LLM_BASE_URL failed (${cause}).`)
    return []
  }
}
