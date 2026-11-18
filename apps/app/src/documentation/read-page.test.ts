import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import { test } from "node:test"
import { createMCPServer, resourceDefinition } from "@tanstack/ai-mcp/server"
import { readDocumentPage } from "./read-page.ts"

const uri = `docs://documents/${"a".repeat(64)}/${"b".repeat(64)}/pages/271`
test("reads cited pages only through the configured MCP server and handles absent resources", async () => {
  const mcp = createMCPServer({ name: "manual-fixture", version: "1", tools: [], resources: [
    resourceDefinition({ uri, name: "page", mimeType: "text/plain" }).read(() => ({ text: "CYCLE832 page 271. <script>source text</script>" })),
  ] })
  const http = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const result = await mcp.fetch(new Request(`http://127.0.0.1${request.url}`, {
      method: request.method, headers: request.headers as Record<string, string>,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    }))
    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(Buffer.from(await result.arrayBuffer()))
  })
  const previous = process.env.APP_MCP_SERVERS
  http.listen(0, "127.0.0.1")
  await once(http, "listening")
  const address = http.address()
  assert(address && typeof address !== "string")
  process.env.APP_MCP_SERVERS = `docs=http://127.0.0.1:${address.port}/mcp`
  try {
    const answer = await readDocumentPage(uri)
    assert.equal(answer.error, null)
    assert.match(answer.text!, /CYCLE832/)
    assert.match(answer.text!, /<script>/)
    const missing = await readDocumentPage(uri.replace("/271", "/272"))
    assert.equal(missing.text, null)
    assert.match(missing.error!, /could not be read/)
    await assert.rejects(readDocumentPage("http://attacker.invalid"), /Invalid/)
    delete process.env.APP_MCP_SERVERS
    assert.match((await readDocumentPage(uri)).error!, /not configured/)
  } finally {
    if (previous === undefined) delete process.env.APP_MCP_SERVERS
    else process.env.APP_MCP_SERVERS = previous
    http.closeAllConnections()
    await new Promise<void>(resolve => http.close(() => resolve()))
  }
})
