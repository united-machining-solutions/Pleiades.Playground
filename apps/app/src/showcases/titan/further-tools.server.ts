import { createMCPClient } from "@tanstack/ai-mcp"

import { furtherServers } from "@/chat/mcp-servers.ts"
import { firstSentence } from "@/chat/server-list.ts"
import { keptClient } from "@/machines/kept-client.ts"

import { readingTools } from "./further-tools.ts"
import type { FurtherServer, FurtherTool, ListedTool } from "./further-tools.ts"

// The further MCP servers of the app, for Titan (further-tools.ts): what each one lists, asked over a
// connection that is kept, and the call of one of their tools. The addresses stay here.

/** A server that takes longer than this to list its tools does not answer, as far as a turn goes. */
const LISTS_WITHIN_MS = 2_000
/** A tool of a further server may take this long. */
const ANSWERS_WITHIN_MS = 15_000
/** What a server listed is kept this long: a turn does not ask every server again. */
const KEEP_MS = 30_000

type Client = Awaited<ReturnType<typeof createMCPClient>>

const connections = new Map<string, ReturnType<typeof keptClient<Client>>>()

/** The kept connection to a server of the settings, or nothing for a name the settings do not have. */
function connectionTo(name: string) {
  const url = furtherServers()[name]
  if (url === undefined) return undefined
  let connection = connections.get(`${name} ${url}`)
  if (!connection) {
    connection = keptClient(() => createMCPClient({ transport: { type: "http", url }, requestOptions: { timeout: ANSWERS_WITHIN_MS } }))
    connections.set(`${name} ${url}`, connection)
  }
  return connection
}

async function within<TValue>(work: Promise<TValue>, ms: number): Promise<TValue | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms)
  })
  try {
    return await Promise.race([work.catch(() => undefined), late])
  } finally {
    clearTimeout(timer)
  }
}

type Listed = { name: string; reachable: boolean; tools: Array<FurtherTool> }

let kept: { servers: Promise<Array<Listed>>; until: number } | undefined

/** Every further server of the settings with the tools Titan takes of it. Never rejects. */
function listed(): Promise<Array<Listed>> {
  if (kept && Date.now() < kept.until) return kept.servers
  const servers = Promise.all(
    Object.keys(furtherServers()).map(async (name) => {
      const tools = await within(connectionTo(name)?.((client) => client.tools() as Promise<ReadonlyArray<ListedTool>>) ?? Promise.resolve(undefined), LISTS_WITHIN_MS)
      return { name, reachable: tools !== undefined, tools: readingTools(name, tools ?? []) }
    }),
  )
  kept = { servers, until: Date.now() + KEEP_MS }
  return servers
}

/** The further servers for the page: their names, whether they answer, and their tools by name. */
export async function furtherServerList(): Promise<Array<FurtherServer>> {
  return (await listed()).map((server) => ({
    name: server.name,
    reachable: server.reachable,
    tools: server.tools.map((tool) => ({ name: tool.name, summary: firstSentence(tool.description) })),
  }))
}

/** The tools of the servers that are on, for a turn. */
export async function furtherToolsOf(servers: ReadonlyArray<string>): Promise<Array<FurtherTool>> {
  if (servers.length === 0) return []
  return (await listed()).filter((server) => servers.includes(server.name)).flatMap((server) => server.tools)
}

/** What a tool wrote as text. */
function textOf(result: { content?: unknown }): string | undefined {
  if (!Array.isArray(result.content)) return undefined
  const texts = result.content.flatMap((part: { type?: unknown; text?: unknown }) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
  return texts.length > 0 ? texts.join("\n") : undefined
}

/**
 * Calls a tool of a further server. The words are for the model, the values for the card: a server that
 * gives its values only as JSON in its text has that text as its values, which is how the chat reads it.
 */
export async function callFurtherTool(tool: FurtherTool, input: Record<string, unknown>): Promise<{ words: string; content: string; failed: boolean }> {
  const connection = connectionTo(tool.server)
  if (!connection) return { words: `The server ${tool.server} is not set up.`, content: "", failed: true }
  try {
    const result = await connection(
      (client) => (client.callTool as (name: string, input: unknown) => Promise<{ isError?: boolean; content?: unknown; structuredContent?: unknown }>)(tool.name, input),
    )
    const words = textOf(result)
    const content = result.structuredContent !== undefined ? JSON.stringify(result.structuredContent) : (words ?? "")
    return { words: words ?? content, content, failed: result.isError === true }
  } catch (error) {
    return { words: `The tool did not answer: ${error instanceof Error ? error.name : "error"}.`, content: "", failed: true }
  }
}
