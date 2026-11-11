import type { MachineShow } from "@pleiades/cards/machine/contract.ts"
import type { MachineList, server } from "@pleiades/genui-mcp"
import { createMCPClient } from "@tanstack/ai-mcp"
import { createServerFn } from "@tanstack/react-start"

// The values come from the generative UI backend. These functions run on the server of the app:
// the browser never talks to the backend itself.

/** Either the values or why there are none: a page says so and keeps trying. */
export type Answer<TValues> = { values: TValues; error: null } | { values: null; error: string }

/** The backend as a typed MCP client: the names of its tools and the shapes of their results are known. */
function connect() {
  const url = process.env.GENUI_MCP_URL ?? "http://localhost:5520/mcp"
  return createMCPClient<typeof server>({ transport: { type: "http", url } })
}

/** Asks the backend and closes the connection again. */
async function ask<TValues>(
  read: (backend: Awaited<ReturnType<typeof connect>>) => Promise<TValues>,
): Promise<Answer<TValues>> {
  try {
    const backend = await connect()
    try {
      return { values: await read(backend), error: null }
    } finally {
      await backend.close()
    }
  } catch (error) {
    return { values: null, error: error instanceof Error ? error.message : String(error) }
  }
}

/** What a tool wrote as text, which is where it says why it failed. */
function textOf(result: unknown): string | undefined {
  const { content } = result as { content?: unknown }
  if (!Array.isArray(content)) return undefined
  const texts = content.flatMap((part: { type?: unknown; text?: unknown }) =>
    part.type === "text" && typeof part.text === "string" ? [part.text] : [],
  )
  return texts[0]
}

/** What every machine does now. */
export const getMachines = createServerFn({ method: "GET" }).handler(
  (): Promise<Answer<MachineList>> =>
    ask(async (backend) => {
      const result = await backend.callTool("genui_machine_list", {})
      if (result.isError || !result.structuredContent) {
        throw new Error(textOf(result) ?? "genui_machine_list returned no values")
      }
      return result.structuredContent
    }),
)

/** One machine with the states of the last hours: the values of the machine card. */
export const getMachine = createServerFn({ method: "GET" })
  .validator((machine: string) => machine)
  .handler(
    ({ data: machine }): Promise<Answer<MachineShow>> =>
      ask(async (backend) => {
        const result = await backend.callTool("genui_machine_show", { machine })
        if (result.isError || !result.structuredContent) {
          throw new Error(textOf(result) ?? "genui_machine_show returned no values")
        }
        return result.structuredContent
      }),
  )
