import { machineList } from "@pleiades/cards/machine/contract.ts"
import { createMCPClient } from "@tanstack/ai-mcp"
import { createServerFn } from "@tanstack/react-start"

import { chatTools } from "@/chat/cards.tsx"
import { backend, mcpServers, serverOfTool } from "@/chat/mcp-servers.ts"
import { within } from "@/chat/server-list.ts"
import type { Answer } from "@/machines/get-machines.ts"
import { listMachines } from "@/machines/get-machines.ts"
import { choicesOf } from "@/machines/switcher.ts"
import type { Choice } from "@/machines/switcher.ts"
import { reasonOf } from "@/reason.ts"

import { cardChoicesOf } from "./add-part.ts"
import type { CardChoice } from "./add-part.ts"
import { pageToolNames } from "./proposal.ts"

// What "Add a card" on a kept page offers, read on the server of the app as the other reads are: the
// browser never talks to a server of the chat itself. The servers list their tools with their input
// schemas, and the app reads from there what each card takes (add-part.ts); the machines are those
// Home lists, by the name the app shows for a machine everywhere.

/**
 * The cards a person can add, and the machines to choose from in the order the backend gave them, or
 * why there are none: then a card that needs a machine cannot be added, and the others can.
 */
export type CardChoices = { cards: Array<CardChoice>; machines: Answer<Array<Choice>> }

/**
 * The cards a page can hold that the backend lists, each with what it takes, and the machines of the
 * stack. Without the tools of the backend nothing can be added: then the answer is the sentence that
 * names who did not answer.
 */
export const getCardChoices = createServerFn({ method: "GET" }).handler(async (): Promise<Answer<CardChoices>> => {
  const [listed, machines] = await Promise.all([listTools(), readMachines()])
  if (listed.values === null) return listed
  return { values: { cards: cardChoicesOf(listed.values, chatTools), machines }, error: null }
})

type Listed = Array<{ name: string; inputSchema?: unknown }>

/** The tools of one server with their input schemas. Rejects if it does not answer. */
async function toolsOf(url: string): Promise<Listed> {
  const client = await createMCPClient({ transport: { type: "http", url } })
  try {
    const tools = await client.tools()
    return tools.map(({ name, inputSchema }) => ({ name, inputSchema }))
  } finally {
    await client.close()
  }
}

/** A further server that takes longer than this to list its tools does not answer, as far as the form goes. */
const FURTHER_WITHIN_MS = 2_000

/**
 * The tools with their input schemas of the servers a page asks (ADR-0025): the backend, and each other
 * server of the chat that has a tool a page can hold. Without the backend nothing can be added; another
 * server that does not answer leaves out only its cards.
 */
async function listTools(): Promise<Answer<Listed>> {
  const further = new Set(
    pageToolNames(chatTools).flatMap((tool) => {
      const server = serverOfTool(tool)
      return server.url !== undefined && server.name !== backend ? [server.url] : []
    }),
  )
  const [own, ...others] = await Promise.allSettled([
    toolsOf(mcpServers()[backend]?.url ?? ""),
    ...[...further].map((url) => within(toolsOf(url), FURTHER_WITHIN_MS)),
  ])
  if (own?.status !== "fulfilled") {
    return { values: null, error: `The generative UI backend did not answer: ${reasonOf(own?.reason)}.` }
  }
  return { values: [...own.value, ...others.flatMap((one) => (one.status === "fulfilled" ? one.value : []))], error: null }
}

/** The machines as Home lists them, checked against the contract of the list: a backend of another version may differ. */
async function readMachines(): Promise<Answer<Array<Choice>>> {
  const answer = await listMachines()
  if (answer.values === null) return answer
  const list = machineList.safeParse(answer.values)
  if (!list.success) return { values: null, error: "genui_machine_list answered with values this app cannot read." }
  return { values: choicesOf(list.data), error: null }
}
