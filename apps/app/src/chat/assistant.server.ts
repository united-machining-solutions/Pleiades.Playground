import { defineChatMiddleware } from "@tanstack/ai"
import type { AnyTextAdapter } from "@tanstack/ai"
import { createAnthropicChat } from "@tanstack/ai-anthropic"
import { createHarnessHost, defineHarness, definePlugin } from "@tanstack/ai-harness"
import { createHarnessHandler } from "@tanstack/ai-harness/server"
import { mcp } from "@tanstack/ai-mcp/harness"
import { createOpenaiChat } from "@tanstack/ai-openai"
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible"
import { memoryPersistence } from "@tanstack/ai-persistence"

import { chatTools } from "./cards.tsx"
import { withTimeZone } from "./local-times.ts"
import { modelNames, modelSettings } from "./models.ts"
import type { ModelSettings } from "./models.ts"
import { forModel } from "./tool-results.ts"

// The agent harness of the app. It runs on the server only: the keys of the language models stay
// here, and the browser talks to /api/harness.

const instructions = `You are Titan, the assistant of a machine shop. People call you with "Hey Titan" and talk to you; your answers are often read aloud, so write the way a calm, competent colleague speaks.
You help people understand what their machines do. Read values with the tools and never invent one. If the tools do not give a reason, say that none is recorded.
Answer in a few plain sentences. The app shows the values of a tool call next to your answer, so do not repeat them as a list or a table.
Keep a balance in every answer, in this order:
1. Answer what was asked, first and short.
2. Then at most one thing the person did not ask for but should know, if the data shows one: an open error, a machine that stands still unplanned, a warning that keeps coming back, a value that is unusual. Say it in one sentence and say that it is a hint, for example "Übrigens: …". Do not add one when there is nothing worth saying.
3. Then at most one suggestion for a next step, as a question the person can answer with yes, for example "Soll ich dir die Details von P-07 zeigen?".
4. When the data cannot answer the question, say so plainly in the first sentence, for example "Das kann ich aus den Daten nicht beantworten.", then what the data can tell instead and where the missing part could come from. Never guess to fill the gap.
Think along with the person: you may look at more tools than the question needs, when that helps you find the hint of point 2. Call tools that do not depend on each other in one turn, together, so the person waits less.
When a picture answers better than words, lay out a view with genui_view_show: you choose the blocks, the tool computes every value. For which machine does not run, or to show the hall, call genui_shopfloor_show.
If the stored values cannot answer a question, for example about costs, do not guess: show what they can tell and what is missing with a gaps block of genui_view_show, and say where it could come from, for example the ERP system or the production planning.
Answer in the language of the question.
The tools write every time as the clock of the person you answer shows it. Say a time the way a clock does, for example 09:30: take the hours and minutes as they stand in the result, do not convert them, and name no time zone and no offset.`

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

// A tool that only a card calls is not for the model. The plugin above has no setting for that,
// so this one takes those tools out of every turn, after the servers listed theirs. Which tools
// those are, the cards say (cards.tsx).
const modelTools = definePlugin({
  name: "pleiades/model-tools",
  setup: () => ({ prepareTools: ({ tools: listed }) => forModel(listed, chatTools) }),
})

// Every tool that takes a time zone is called with the one of the person who asks. What the
// browser sent along with the question is the context of the run.
const localTimes = defineChatMiddleware({
  name: "local-times",
  onBeforeToolCall(ctx, call) {
    const args = withTimeZone(call.args, call.tool?.inputSchema, ctx.context)
    return args && { type: "transformArgs", args }
  },
})

/**
 * The adapter of one model. Each provider gets its own: Anthropic and OpenAI theirs, any other
 * endpoint the one for chat completions. Where two blocks name the same model, the earlier one
 * has it.
 *
 * The names come from the settings, not from the lists the adapters know. A name a provider does
 * not have fails at the first question, with the provider's own words.
 */
function adapterOf(name: string, { anthropic, openai, compatible }: ModelSettings): AnyTextAdapter {
  if (anthropic?.models.includes(name)) {
    return createAnthropicChat(name as Parameters<typeof createAnthropicChat>[0], anthropic.apiKey)
  }
  if (openai?.models.includes(name)) {
    return createOpenaiChat(name as Parameters<typeof createOpenaiChat>[0], openai.apiKey)
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
      middleware: [localTimes],
      systemPrompts: [instructions],
      plugins: () => [tools, modelTools],
    }),
    // The demo has no sign-in: every request runs without a user.
    openAccess: true,
  })
  return handler
}
