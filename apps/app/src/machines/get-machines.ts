import type { MachineList, server } from "@pleiades/genui-mcp"
import { createMCPClient } from "@tanstack/ai-mcp"
import { createServerFn } from "@tanstack/react-start"

export type MachinesAnswer = { list: MachineList; error: null } | { list: null; error: string }

/**
 * What every machine does now, from the generative UI backend. This runs on the server of the app:
 * the browser never talks to the backend itself.
 */
export const getMachines = createServerFn({ method: "GET" }).handler(async (): Promise<MachinesAnswer> => {
  const url = process.env.GENUI_MCP_URL ?? "http://localhost:5520/mcp"
  try {
    const client = await createMCPClient<typeof server>({ transport: { type: "http", url } })
    try {
      const result = await client.callTool("genui_machine_list", {})
      if (result.isError || !result.structuredContent) {
        throw new Error("genui_machine_list returned no values")
      }
      return { list: result.structuredContent, error: null }
    } finally {
      await client.close()
    }
  } catch (error) {
    return { list: null, error: error instanceof Error ? error.message : String(error) }
  }
})
