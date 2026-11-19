import { createMCPClient } from "@tanstack/ai-mcp"
import { createServerFn } from "@tanstack/react-start"

import { furtherServers } from "@/chat/mcp-servers.ts"
import { textOf } from "@/machines/get-machines.ts"
import { reasonOf } from "@/reason.ts"

// The order of a person: the drink card orders and follows its order on the server of the app, over
// the same MCP server of the juice bar the chat has (APP_MCP_SERVERS, the entry `juicebar`). The
// button of the card is the confirmation: no language model is asked in between. The service of the
// juice bar keeps its own guards (ordering switched on, the machine ready, the queue not full), and
// the start button of the machine stays the last one: no drink runs without a person at the machine.

/**
 * What a call got: the JSON the tool wrote, or why there is none in a sentence. `answered`: the juice bar
 * answered and said why; without an answer nobody knows what it did with the call.
 */
export type JuiceBarAnswer = { ok: true; json: string } | { ok: false; reason: string; answered: boolean }

/** How long a read may take: the card reads its order every second. */
export const READ_TIMEOUT_MS = 5_000
/** How long an order may take: the service waits for the machine to answer it once. */
export const ORDER_TIMEOUT_MS = 20_000

/** Calls a tool of the juice bar on the server of the app: the JSON it wrote, or why there is none. */
async function callJuiceBar(
  tool: string,
  args: Record<string, unknown>,
  timeout = READ_TIMEOUT_MS,
): Promise<JuiceBarAnswer> {
  const url = furtherServers().juicebar
  if (!url) return { ok: false, reason: "The app has no juice bar (APP_MCP_SERVERS names none).", answered: true }
  try {
    const juiceBar = await createMCPClient({ transport: { type: "http", url }, requestOptions: { timeout } })
    try {
      const result = await juiceBar.callTool(tool, args)
      const text = textOf(result)
      if (result.isError) return { ok: false, reason: text ?? `${tool} failed.`, answered: true }
      if (result.structuredContent !== undefined) return { ok: true, json: JSON.stringify(result.structuredContent) }
      return text === undefined ? { ok: false, reason: `${tool} returned nothing.`, answered: true } : { ok: true, json: text }
    } finally {
      await juiceBar.close().catch(() => undefined)
    }
  } catch (error) {
    return { ok: false, reason: `The juice bar did not answer: ${reasonOf(error)}.`, answered: false }
  }
}

/** Orders one drink at the machine. Sent once: the card never repeats a failed order by itself. */
export const orderDrink = createServerFn({ method: "POST" })
  .validator((drinkId: string) => {
    if (!/^[\w-]{1,64}$/.test(drinkId)) throw new Error("A drink is named by its id.")
    return drinkId
  })
  .handler(({ data: drinkId }) => callJuiceBar("juicebar_order_create", { drinkId }, ORDER_TIMEOUT_MS))

/** Reads an order: its state and its progress. */
export const readOrder = createServerFn({ method: "GET" })
  .validator((orderNumber: number) => {
    if (!Number.isInteger(orderNumber) || orderNumber < 0) throw new Error("An order is named by its number.")
    return orderNumber
  })
  .handler(({ data: orderNumber }) => callJuiceBar("juicebar_order_get", { orderNumber }))
