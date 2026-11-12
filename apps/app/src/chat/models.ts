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

/** A block counts only if it is complete: what it needs to sign in, and at least one model. */
export function modelSettings(env: Readonly<Record<string, string | undefined>>): ModelSettings {
  const settings: ModelSettings = {}
  const anthropic = names(env.ANTHROPIC_MODELS)
  if (env.ANTHROPIC_API_KEY && anthropic.length > 0) {
    settings.anthropic = { apiKey: env.ANTHROPIC_API_KEY, models: anthropic }
  }
  const openai = names(env.OPENAI_MODELS)
  if (env.OPENAI_API_KEY && openai.length > 0) {
    settings.openai = { apiKey: env.OPENAI_API_KEY, models: openai }
  }
  const compatible = names(env.LLM_MODELS)
  if (env.LLM_BASE_URL && compatible.length > 0) {
    // A local model server often wants no key, but the request needs one.
    settings.compatible = { baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY || "not-needed", models: compatible }
  }
  return settings
}

/**
 * What a block lacks that was begun: "ANTHROPIC_API_KEY is set, ANTHROPIC_MODELS is empty". It names
 * settings and never a value. A line of model names without its key is not a gap: the names have
 * defaults, and a block without a key is simply not used.
 */
export function settingGaps(env: Readonly<Record<string, string | undefined>>): Array<string> {
  const gaps: Array<string> = []
  const gap = (set: string, empty: string) => gaps.push(`${set} is set, ${empty} is empty`)
  if (env.ANTHROPIC_API_KEY && names(env.ANTHROPIC_MODELS).length === 0) gap("ANTHROPIC_API_KEY", "ANTHROPIC_MODELS")
  if (env.OPENAI_API_KEY && names(env.OPENAI_MODELS).length === 0) gap("OPENAI_API_KEY", "OPENAI_MODELS")
  const compatible = names(env.LLM_MODELS)
  if (env.LLM_BASE_URL && compatible.length === 0) gap("LLM_BASE_URL", "LLM_MODELS")
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
