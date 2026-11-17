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

const instructions = `You help people in a machine shop understand what their machines do.
Read values with the tools and never invent one. If the tools do not give a reason, say that your tools show none.
If no tool gives what the person asks for, say that your tools do not show it, not that it does not exist: it may be recorded where your tools do not reach.
Then, where a place fits the question, say in one sentence where to ask: the maker of the machine or its manuals for a fault or a specification, the maintenance records for a service, the people at the machine for what happened there.
If none fits, say only that your tools do not show it. Name a maker, a person or an address only when a tool result names one, and say nothing about what they will do or know.
Answer in a few plain sentences. The app shows the values of a tool call next to your answer, so do not repeat them as a list or a table.
The tools write every time as the clock of the person you answer shows it. Say a time the way a clock does, for example 09:30: take the hours and minutes as they stand in the result, do not convert them, and name no time zone and no offset.`

// The OPC UA adapter, if the app has one: it scans OPC UA servers and proposes their registration.
// Adding and removing a machine are buttons of its cards, not tools (src/cards/opcua).
const opcuaUrl = process.env.OPCUA_MCP_URL?.trim() || undefined

const opcuaInstructions = `OPC UA machines: the tools named opcua_* belong to the OPC UA adapter. Read opcua_get_skill_guide before you scan a server, and follow it.
You can list the added OPC UA servers, show the mapping of one, and scan a server and propose its registration.
A machine named without an address, for example A1121O0001, has the endpoint opc.tcp://A1121O0001:4840. If that endpoint does not answer, ask the person for the endpoint; do not try another address of your own.
An address the person gives may be a gateway that serves several machines: call opcua_machine_list for it, and propose one registration per machine that is not added yet, each with its machineNode and the serial number the list gives. A machine found behind an address is reached at that address, never at opc.tcp://<machine>:4840.
A server may want a user (opcua_endpoint_rank says needsUser). Never ask for a user name or a password in the chat, and never pass one to a tool: the card of opcua_endpoint_rank asks the person for them and stores them. Wait until the person says it is done, then go on; the tools log in with the stored user by themselves.
You cannot add or remove a machine: the person does that with the buttons of the cards. Never say that a machine was added or removed.`

// The tools of the generative UI backend, of the OPC UA adapter if the app has one, and of the further
// servers the settings name, under their own names (mcp-servers.ts). A server that does not answer has no
// tools until it does; the others work. Created once, shared by all chats.
const tools = mcp({
  servers: {
    ...mcpServers(),
    ...(opcuaUrl && {
      opcua: {
        type: "http" as const,
        url: opcuaUrl,
        toolName: (tool: { name: string }) => tool.name,
        // A scan browses and reads a whole address space: give a call more time than the default.
        timeoutMs: 120_000,
      },
    }),
  },
})

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
  return openaiCompatibleText(name, { baseURL, apiKey, api: "chat-completions" })
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
      systemPrompts: opcuaUrl ? [instructions, opcuaInstructions] : [instructions],
      plugins: () => [tools, switchPlugin, modelTools],
    }),
    // The demo has no sign-in: every request runs without a user.
    openAccess: true,
  })
}
