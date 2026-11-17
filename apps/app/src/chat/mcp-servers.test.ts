import assert from "node:assert/strict"
import { test } from "node:test"

import {
  furtherInstructions,
  furtherServers,
  isOnBy,
  leftOut,
  mcpServers,
  serverOfKey,
  serverSwitches,
  switchKey,
  switchedOn,
} from "./mcp-servers.ts"

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

const two = { APP_MCP_SERVERS: "ultimaker=http://ultimaker-api:8080/mcp,juicebar=http://juicebar-api:8080/mcp" }

/** A tool as the client library hands it on: it names the server it came from. */
const from = (serverId: string, name: string): { name: string; metadata: Record<string, unknown> } => ({
  name,
  metadata: { mcp: { serverId } },
})

test("a chat has a switch for each further server, on until it is switched off, and none for the backend", () => {
  assert.deepEqual(serverSwitches(two), {
    "server.ultimaker": { type: "boolean", default: true },
    "server.juicebar": { type: "boolean", default: true },
  })
  assert.deepEqual(serverSwitches({}), {})
  assert.equal(serverOfKey(switchKey("ultimaker")), "ultimaker")
  assert.equal(serverOfKey("model"), undefined)
})

test("a server that is switched off gives the model no tool, and the others give all of theirs", () => {
  const listed = [
    from("genui", "genui_machine_list"),
    from("ultimaker", "ultimaker_print_start"),
    from("ultimaker", "ultimaker_printer_status"),
    from("juicebar", "juicebar_order"),
    { name: "a_tool_of_the_app", metadata: {} },
  ]
  const off = { "server.ultimaker": false }
  const isOn = isOnBy((key) => (off as Record<string, unknown>)[key])
  assert.deepEqual(
    switchedOn(listed, isOn, two).map((tool) => tool.name),
    ["genui_machine_list", "juicebar_order", "a_tool_of_the_app"],
  )
  // Without a word of the chat every server is on.
  assert.equal(switchedOn(listed, isOnBy(() => undefined), two).length, 5)
})

test("the backend cannot be switched off, whatever a chat's settings say", () => {
  const listed = [from("genui", "genui_machine_list"), from("ultimaker", "ultimaker_printer_status")]
  const allOff = isOnBy(() => false)
  assert.deepEqual(
    switchedOn(listed, allOff, two).map((tool) => tool.name),
    ["genui_machine_list"],
  )
})

test("the model is told only about the servers that are on, and where to switch one on when none is", () => {
  const isOn = isOnBy((key) => key !== "server.ultimaker")
  const told = furtherInstructions(two, isOn) ?? ""
  assert.match(told, /begin with its name: juicebar\./)
  assert.doesNotMatch(told, /ultimaker/)
  assert.match(furtherInstructions(two, () => false) ?? "", /switched off in this chat/)
  assert.equal(furtherInstructions({}, () => false), undefined)
})
