import { defineChatMiddleware } from "@tanstack/ai"
import type { AnyTextAdapter } from "@tanstack/ai"
import { createHarnessHost, defineHarness, definePlugin } from "@tanstack/ai-harness"
import { createHarnessHandler } from "@tanstack/ai-harness/server"
import { mcp } from "@tanstack/ai-mcp/harness"
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible"
import { memoryPersistence } from "@tanstack/ai-persistence"

import { chatTools } from "./cards.tsx"
import { chatSettings } from "./gateway.ts"
import type { ChatSettings } from "./gateway.ts"
import { withTimeZone } from "./local-times.ts"
import { modelNames } from "./models.ts"
import type { ModelSettings } from "./models.ts"
import { leftOut, mcpServers, serverSwitch } from "./mcp-servers.ts"
import { forModel } from "./tool-results.ts"

// The agent harness of the app. It runs on the server only: the keys of the language models stay
// here, and the browser talks to /api/harness.

const instructions = `You are Titan, the assistant of a machine shop. People call you with "Hey Titan" and talk to you; your answers are often read aloud, so write the way a calm, competent colleague speaks.
Read values with the tools and never invent one. If the tools do not give a reason, say that your tools show none.
If no tool gives what the person asks for, say that your tools do not show it, not that it does not exist: it may be recorded where your tools do not reach.
Then, where a place fits the question, say in one sentence where to ask: the maker of the machine or its manuals for a fault or a specification, the maintenance records for a service, the people at the machine for what happened there.
If none fits, say only that your tools do not show it. Name a maker, a person or an address only when a tool result names one, and say nothing about what they will do or know.
You talk to the person who runs the hall. What they want to know first is where they must act and what to do; less is more. Write an answer in this shape, nothing else around it:
- First the headline: one short sentence, at most fifteen words, that answers the question, in plain everyday words, the way you would tell a colleague at the machine. Say what a value means, not only the value: "P-04 steht, weil der Spindelantrieb ausgefallen ist", not "Alarm 31002".
- Then, when there is something to do, one sentence that begins with "Empfehlung:" and says what to do first, as a short instruction, for example "Empfehlung: Ruf die Instandhaltung an P-04." Recommend only what follows from the data and from common practice at a machine; never invent a cause.
- Then, for each machine that needs someone and that the answer is about, at most three, one line of a markdown list in exactly this form: "- **P-04** | the problem in one plain sentence | the next step, as a short instruction". For example: "- **P-04** | Der Spindelantrieb ist ausgefallen, der Auftrag wartet. | Instandhaltung rufen, Antrieb prüfen." No states, codes, times or counts in the list: the screen shows them from the values next to it. The list is not read aloud, so do not repeat it in the sentences, and write no other list or table.
- Then the hint and the suggestion of points 2 and 3 below, each as its own short paragraph.
Draw a card only when the person asks to see something, such as the hall, a machine or a history; for "how is the hall doing" the screen shows the state of every machine already.
Before you call a tool that draws a card, write one short sentence that says what you are about to show, for example "Ich zeige dir die Halle." It is said while the card loads.
Never talk about your tools, their calls or their errors: if a call fails, call it again or answer with what you have.
Keep a balance in every answer, in this order:
1. Answer what was asked, first and short.
2. Then at most one thing the person did not ask for but should know, if the data shows one: an open error, a machine that stands still unplanned, a warning that keeps coming back, a value that is unusual. Say it in one sentence and say that it is a hint, for example "Übrigens: …". Do not add one when there is nothing worth saying.
3. Then at most one suggestion for a next step, as a question the person can answer with yes, for example "Soll ich dir die Details von P-07 zeigen?".
4. When the data cannot answer the question, say so plainly in the first sentence, for example "Das kann ich aus den Daten nicht beantworten.", then what the data can tell instead and where the missing part could come from. Never guess to fill the gap.
Think along with the person: you may look at more tools than the question needs, when that helps you find the hint of point 2. Call tools that do not depend on each other in one turn, together, so the person waits less.
When a picture answers better than words, lay out a view with genui_view_show: you choose the blocks, the tool computes every value. To show the hall, call genui_shopfloor_show.
If the stored values cannot answer a question, for example about costs, do not guess: show what they can tell and what is missing with a gaps block of genui_view_show, and say where it could come from, for example the ERP system or the production planning.
Answer in the language of the question.
Name a machine the way people call it, by its serial number, for example P-04, also in the list; never by its machine id such as alcyone-machines_AX-400_P-04, which only the tools take.
The tools write every time as the clock of the person you answer shows it. Say a time the way a clock does, for example 09:30: take the hours and minutes as they stand in the result, do not convert them, and name no time zone and no offset.`

// The tools of the generative UI backend, and of the further servers the settings name, under their own
// names (mcp-servers.ts). A server that does not answer has no tools until it does; the others work.
// Created once, shared by all chats.
const tools = mcp({ servers: mcpServers() })

// A chat switches a further server off and on (the panel "Tools" of the chat). The setting is the chat's,
// kept by the harness, and it holds here, on the server: before every turn the tools of a server that is
// off are taken out of what the model gets, and the model is told only about the servers that are on.
// Which servers there are is read once, here, as it is for the connections above.
const switches = serverSwitch()
const switchPlugin = definePlugin({
  name: "pleiades/server-switch",
  setup: (ctx) => switches.forChat((key) => ctx.config.get(key)),
})

// A typing mistake in the setting shows here, once, when the server starts.
for (const name of leftOut()) {
  console.warn(`APP_MCP_SERVERS: the entry "${name}" is left out. An entry is name=address, the name in lower case.`)
}

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
 * The adapter of one model: OpenAI's chat completions at the endpoint of the settings. The names come
 * from the settings or from the endpoint's own list. A name the endpoint does not have fails at the
 * first question, with the endpoint's own words.
 */
function adapterOf(name: string, { baseURL, apiKey }: ModelSettings): AnyTextAdapter {
  return openaiCompatibleText(name, { baseURL, apiKey, api: "chat-completions", fetch: answeringAtOnce(name) })
}

/**
 * Haiku answers Titan, and Titan is talked to: at the hub it sometimes thought for twenty seconds
 * before it called a tool, while the person waited in silence. This asks it to answer without
 * thinking first. Other models keep what their endpoint does by default.
 */
function answeringAtOnce(name: string): typeof fetch | undefined {
  if (!/haiku/i.test(name)) return undefined
  return (input, init) => {
    if (typeof init?.body !== "string") return fetch(input, init)
    let body: Record<string, unknown>
    try {
      body = JSON.parse(init.body) as Record<string, unknown>
    } catch {
      return fetch(input, init)
    }
    if (body.reasoning_effort !== undefined) return fetch(input, init)
    return fetch(input, { ...init, body: JSON.stringify({ ...body, reasoning_effort: "none" }) })
  }
}

type Handler = (request: Request) => Promise<Response>

// The handler and the snapshot of the settings it was built from. A new snapshot comes only where the
// last one had no models (see gateway.ts), so a handler that serves chats is never replaced.
let built: { chat: ChatSettings; handler: Handler | null } | undefined

/** The fetch handler of the harness, or null as long as no language model is configured. */
export async function harnessHandler(): Promise<Handler | null> {
  const chat = await chatSettings()
  // No await between the check and the assignment: requests that wait for the same snapshot share one handler.
  if (built?.chat !== chat) built = { chat, handler: build(chat.settings) }
  return built.handler
}

function build(settings: ModelSettings | undefined): Handler | null {
  const names = modelNames(settings)
  const [first] = names
  if (settings === undefined || first === undefined) return null
  // In the order of the settings, which is the order the chat offers them in.
  const models = Object.fromEntries(names.map((name) => [name, adapterOf(name, settings)]))
  return createHarnessHandler({
    // Chats live in memory: they are gone when the server restarts.
    host: createHarnessHost({ persistence: memoryPersistence() }),
    harness: defineHarness({
      name: "pleiades/assistant",
      // The first model the settings name answers until a chat picks another one of them by
      // name. The harness keeps that choice with the chat.
      adapter: models[first],
      models,
      // Of a chat's settings the browser may change the model and switch a further server off and
      // on, and nothing else.
      expose: { settings: ["model"], config: switches.exposed },
      middleware: [localTimes],
      systemPrompts: [instructions],
      plugins: () => [tools, switchPlugin, modelTools],
    }),
    // The demo has no sign-in: every request runs without a user.
    openAccess: true,
  })
}
