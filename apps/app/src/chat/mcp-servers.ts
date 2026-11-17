// The MCP servers whose tools the chat hands to its language model, read from the settings of the
// server. The generative UI backend is always there. Further servers, the optional services of the
// stack, are named in one setting, so a stack without them starts and answers as before and the app
// has no code for any one of them.

type Settings = Record<string, string | undefined>

type Server = { type: "http"; url: string; toolName: (tool: { name: string }) => string }

// Every server names its tools with a prefix of its own, so the chat keeps the names as they are.
const server = (url: string): Server => ({ type: "http", url, toolName: (tool) => tool.name })

const backend = "genui"

/**
 * The further servers of APP_MCP_SERVERS: `name=url`, separated by commas, for example
 * `ultimaker=http://ultimaker-api:8080/mcp,juicebar=http://juicebar-api:8080/mcp`. An entry that is not a
 * name in lower case and an http(s) address is left out, and so is a second entry of a name.
 */
export function furtherServers(settings: Settings = process.env): Record<string, string> {
  return read(settings).servers
}

/**
 * The entries of APP_MCP_SERVERS that were left out, each by what stands before its `=`, so that a typing
 * mistake shows in the log of the server and not only in a chat that lacks tools. Never the address.
 */
export function leftOut(settings: Settings = process.env): Array<string> {
  return read(settings).leftOut
}

function read(settings: Settings): { servers: Record<string, string>; leftOut: Array<string> } {
  const servers: Record<string, string> = {}
  const leftOut: Array<string> = []
  for (const entry of (settings.APP_MCP_SERVERS ?? "").split(",")) {
    if (entry.trim() === "") continue
    const at = entry.indexOf("=")
    const name = (at < 0 ? entry : entry.slice(0, at)).trim()
    const url = at < 0 ? "" : entry.slice(at + 1).trim()
    const named = /^[a-z][a-z0-9]*$/.test(name) && name !== backend && !(name in servers)
    if (named && /^https?:\/\/\S+$/.test(url) && URL.canParse(url)) servers[name] = url
    // What stands there may be an address, or part of one, and an address stays out of the log.
    else leftOut.push(/^[\w-]+$/.test(name) ? name : "(entry without a name)")
  }
  return { servers, leftOut }
}

export function mcpServers(settings: Settings = process.env): Record<string, Server> {
  const servers: Record<string, Server> = { [backend]: server(settings.GENUI_MCP_URL ?? "http://localhost:5520/mcp") }
  for (const [name, url] of Object.entries(furtherServers(settings))) servers[name] = server(url)
  return servers
}

/**
 * What the language model is told about the further servers, or undefined where there are none. The app
 * draws nothing for their tools, so the answer has to say the values.
 */
export function furtherInstructions(settings: Settings = process.env): string | undefined {
  const names = Object.keys(furtherServers(settings))
  if (names.length === 0) return undefined
  return `Besides the machines you reach other devices, each with tools that begin with its name: ${names.join(", ")}.
The app draws nothing for these tools, so say their values in your answer.
Use a tool that starts, orders or changes something only when the person asked for exactly that, and once. Then say what happens next, in the words of the result.`
}
