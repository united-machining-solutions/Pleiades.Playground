import type { AnyTextAdapter } from "@tanstack/ai"
import { createAnthropicChat } from "@tanstack/ai-anthropic"
import { createHarnessHost, defineHarness } from "@tanstack/ai-harness"
import { createHarnessHandler } from "@tanstack/ai-harness/server"
import { mcp } from "@tanstack/ai-mcp/harness"
import { createOpenaiChat } from "@tanstack/ai-openai"
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible"
import { memoryPersistence } from "@tanstack/ai-persistence"

import { modelNames, modelSettings } from "./models.ts"
import type { ModelSettings } from "./models.ts"

// The agent harness of the app. It runs on the server only: the keys of the language models stay
// here, and the browser talks to /api/harness.

const instructions = `You help people in a machine shop understand what their machines do.
Read values with the tools and never invent one. If the tools do not give a reason, say that none is recorded.
Answer in a few plain sentences. The app shows the values of a tool call next to your answer, so do not repeat them as a list or a table.`

// The tools of the generative UI backend, under their own names. Created once, shared by all chats.
const tools = mcp({
  servers: {
    genui: {
      type: "http",
      url: process.env.GENUI_MCP_URL ?? "http://localhost:5520/mcp",
      toolName: (tool) => tool.name,
    },
  },
})

/**
 * The adapter of one model. Each provider gets its own: OpenAI and Anthropic theirs, any other
 * endpoint the one for chat completions. Where two blocks name the same model, the earlier one
 * has it.
 *
 * The names come from the settings, not from the lists the adapters know. A name a provider does
 * not have fails at the first question, with the provider's own words.
 */
function adapterOf(name: string, { openai, anthropic, compatible }: ModelSettings): AnyTextAdapter {
  if (openai?.models.includes(name)) {
    return createOpenaiChat(name as Parameters<typeof createOpenaiChat>[0], openai.apiKey)
  }
  if (anthropic?.models.includes(name)) {
    return createAnthropicChat(name as Parameters<typeof createAnthropicChat>[0], anthropic.apiKey)
  }
  return openaiCompatibleText(name, {
    baseURL: compatible?.baseURL ?? "",
    apiKey: compatible?.apiKey ?? "",
    api: "chat-completions",
  })
}

let handler: ((request: Request) => Promise<Response>) | undefined

/** The fetch handler of the harness, or null as long as no language model is configured. */
export function harnessHandler() {
  if (handler) return handler
  const settings = modelSettings(process.env)
  const names = modelNames(settings)
  const [first] = names
  if (first === undefined) return null
  // In the order of the settings, which is the order the chat offers them in.
  const models = Object.fromEntries(names.map((name) => [name, adapterOf(name, settings)]))
  handler = createHarnessHandler({
    // Chats live in memory: they are gone when the server restarts.
    host: createHarnessHost({ persistence: memoryPersistence() }),
    harness: defineHarness({
      name: "pleiades/assistant",
      // The first model the settings name answers until a chat picks another one of them by
      // name. The harness keeps that choice with the chat.
      adapter: models[first],
      models,
      // Of a chat's settings the browser may change the model, and nothing else.
      expose: { settings: ["model"] },
      systemPrompts: [instructions],
      plugins: () => [tools],
    }),
    // The demo has no sign-in: every request runs without a user.
    openAccess: true,
  })
  return handler
}
