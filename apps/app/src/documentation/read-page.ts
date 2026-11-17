import { createMCPClient } from "@tanstack/ai-mcp"
import { furtherServers } from "../chat/mcp-servers.ts"
import { pageUri } from "./results.ts"

export type PageAnswer = { text: string; error: null } | { text: null; error: string }

/** Uses only the configured docs server; the browser cannot choose a network destination. */
export async function readDocumentPage(uri: string): Promise<PageAnswer> {
  pageUri(uri)
  const url = furtherServers().docs
  if (!url) return { text: null, error: "The documentation server is not configured. Set APP_MCP_SERVERS with a docs entry." }
  try {
    const client = await createMCPClient({ transport: { type: "http", url } })
    try {
      const result = await client.readResource(uri, { signal: AbortSignal.timeout(120_000) })
      const text = result.contents.flatMap(content => content.uri === uri && "text" in content ? [content.text] : []).join("\n\n")
      if (!text) return { text: null, error: "This documentation page is unavailable. Search again." }
      return { text, error: null }
    } finally { await client.close() }
  } catch {
    return { text: null, error: "The documentation page could not be read. Its source may have changed, or the server may be unavailable. Search again or retry." }
  }
}
