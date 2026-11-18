import { machineList } from "@pleiades/cards/machine/contract.ts"
import { createMCPClient } from "@tanstack/ai-mcp"
import { createServerFn } from "@tanstack/react-start"

import { chatTools } from "@/chat/cards.tsx"
import type { Answer } from "@/machines/get-machines.ts"
import { listMachines, reasonOf } from "@/machines/get-machines.ts"
import { choicesOf } from "@/machines/switcher.ts"
import type { Choice } from "@/machines/switcher.ts"

import { cardChoicesOf } from "./add-part.ts"
import type { CardChoice } from "./add-part.ts"

// What "Add a card" on a kept page offers, read on the server of the app as the other reads are: the
// browser never talks to the generative UI backend itself. The backend lists its tools with their
// input schemas, and the app reads from there what each card takes (add-part.ts); the machines are
// those Home lists, by the name the app shows for a machine everywhere.

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

/** The tools of the backend with their input schemas. */
async function listTools(): Promise<Answer<Array<{ name: string; inputSchema?: unknown }>>> {
  try {
    const backend = await createMCPClient({
      transport: { type: "http", url: process.env.GENUI_MCP_URL ?? "http://localhost:5520/mcp" },
    })
    try {
      const tools = await backend.tools()
      return { values: tools.map(({ name, inputSchema }) => ({ name, inputSchema })), error: null }
    } finally {
      await backend.close()
    }
  } catch (error) {
    return { values: null, error: `The generative UI backend did not answer: ${reasonOf(error)}.` }
  }
}

/** The machines as Home lists them, checked against the contract of the list: a backend of another version may differ. */
async function readMachines(): Promise<Answer<Array<Choice>>> {
  const answer = await listMachines()
  if (answer.values === null) return answer
  const list = machineList.safeParse(answer.values)
  if (!list.success) return { values: null, error: "genui_machine_list answered with values this app cannot read." }
  return { values: choicesOf(list.data), error: null }
}
