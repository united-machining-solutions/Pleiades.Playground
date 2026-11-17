import assert from "node:assert/strict"
import { test } from "node:test"

import { furtherInstructions, furtherServers, leftOut, mcpServers } from "./mcp-servers.ts"

test("without a setting the chat has the generative UI backend and nothing else", () => {
  const servers = mcpServers({})
  assert.deepEqual(Object.keys(servers), ["genui"])
  assert.equal(servers.genui?.url, "http://localhost:5520/mcp")
  assert.equal(furtherInstructions({ APP_MCP_SERVERS: " " }), undefined)
})

test("further servers join in their order, and the tools keep their names", () => {
  const settings = {
    GENUI_MCP_URL: "http://genui-mcp:8080/mcp",
    APP_MCP_SERVERS: "ultimaker=http://ultimaker-api:8080/mcp , juicebar = http://juicebar-api:8080/mcp",
  }
  const servers = mcpServers(settings)
  assert.deepEqual(Object.keys(servers), ["genui", "ultimaker", "juicebar"])
  assert.equal(servers.genui?.url, "http://genui-mcp:8080/mcp")
  assert.equal(servers.juicebar?.url, "http://juicebar-api:8080/mcp")
  assert.equal(servers.juicebar?.toolName({ name: "juicebar_status" }), "juicebar_status")
  assert.match(furtherInstructions(settings) ?? "", /ultimaker, juicebar/)
})

test("an entry that is no name and address is left out, and the backend cannot be replaced", () => {
  assert.deepEqual(
    furtherServers({
      APP_MCP_SERVERS:
        "genui=http://other:1/mcp,Bad=http://a/mcp,noaddress,file=ftp://a/mcp,a=http://a/mcp,a=http://b/mcp,,b=http://",
    }),
    { a: "http://a/mcp" },
  )
})

test("what was left out is named, without its address, so a typing mistake shows", () => {
  const settings = { APP_MCP_SERVERS: "Juicebar=http://some-host:8080/mcp, ultimaker ,ok=http://ok/mcp," }
  assert.deepEqual(leftOut(settings), ["Juicebar", "ultimaker"])
  assert.deepEqual(furtherServers(settings), { ok: "http://ok/mcp" })
  assert.deepEqual(leftOut({ APP_MCP_SERVERS: "http://some-host:8080/mcp,http://some-host/mcp?a=b" }), [
    "(entry without a name)",
    "(entry without a name)",
  ])
  assert.deepEqual(leftOut({}), [])
})
