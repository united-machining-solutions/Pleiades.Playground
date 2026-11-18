import { backend, mcpServers } from "./mcp-servers.ts"

// What the panel "Tools" of the chat shows: the servers whose tools the chat hands to its language model,
// whether each one answers, and its tools by name. The app asks every server itself, the way it asks the
// gateway for its models: the harness knows the state of a server only inside a chat that has run, and
// never the names of its tools. So the list says what answers the app now. A chat has its own connections
// to the servers: one that has just come back can be listed here a moment before the chat has its tools.
// The address of a server stays here; the browser gets its name.

export type ServerTool = {
  name: string
  /**
   * The tool can start or change something: the server does not say that it only reads
   * (`annotations.readOnlyHint`). A hint of the server, shown as one. It is no boundary.
   */
  changes: boolean
}

export type ListedServer = {
  /** The name of the server in the settings, which is also what its tools begin with. */
  name: string
  /** The generative UI backend. The cards need it, so no chat switches it off. */
  builtIn: boolean
  /** Whether the server answered with its tools just now. */
  reachable: boolean
  tools: Array<ServerTool>
}

type Settings = Record<string, string | undefined>

/** What a server listed, as the client library hands it on: a name and what the server says about the tool. */
type Listed = ReadonlyArray<{ name: string; metadata?: { mcp?: { annotations?: { readOnlyHint?: boolean } } } }>

/** Asks one server for its tools. Rejects if it does not answer. */
export type AskServer = (url: string) => Promise<Listed>

/** One server of the list: with its tools if it answered, without any if it did not. */
export function listedServer(name: string, listed: Listed | undefined): ListedServer {
  return {
    name,
    builtIn: name === backend,
    reachable: listed !== undefined,
    tools: (listed ?? []).map((tool) => ({
      name: tool.name,
      changes: tool.metadata?.mcp?.annotations?.readOnlyHint !== true,
    })),
  }
}

const TIMEOUT_MS = 2_000
const KEEP_MS = 5_000

/** A server that takes longer than this to connect and list does not answer, as far as the panel goes. */
async function within<TValue>(work: Promise<TValue>, ms: number): Promise<TValue> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Connects, lists the tools and closes again. The client library is loaded here, so a test needs none. */
const askOverHttp: AskServer = async (url) => {
  const { createMCPClient } = await import("@tanstack/ai-mcp")
  const client = await createMCPClient({ transport: { type: "http", url }, requestOptions: { timeout: TIMEOUT_MS } })
  try {
    return await client.tools()
  } finally {
    await client.close().catch(() => undefined)
  }
}

/** The servers of the settings in their order, each asked at the same time. Never rejects. */
export async function listServers(settings: Settings = process.env, ask: AskServer = askOverHttp): Promise<Array<ListedServer>> {
  return Promise.all(
    Object.entries(mcpServers(settings)).map(async ([name, { url }]) => {
      const listed = await within(ask(url), TIMEOUT_MS).catch(() => undefined)
      return listedServer(name, listed)
    }),
  )
}

let kept: { servers: Promise<Array<ListedServer>>; until: number } | undefined

/** The list for the panel. Panels that open within a few seconds share one round of questions to the servers. */
export function serverList(clock: () => number = Date.now): Promise<Array<ListedServer>> {
  if (!kept || clock() >= kept.until) kept = { servers: listServers(), until: clock() + KEEP_MS }
  return kept.servers
}
