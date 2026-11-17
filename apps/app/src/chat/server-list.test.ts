import assert from "node:assert/strict"
import { test } from "node:test"

import { listServers, listedServer } from "./server-list.ts"

const readOnly = { mcp: { annotations: { readOnlyHint: true } } }

test("a server that answered is listed with its tools, and a tool that does not say it only reads is marked", () => {
  const server = listedServer("ultimaker", [
    { name: "ultimaker_printer_status", metadata: readOnly },
    { name: "ultimaker_print_start", metadata: { mcp: { annotations: { readOnlyHint: false } } } },
    { name: "ultimaker_says_nothing" },
  ])
  assert.deepEqual(server, {
    name: "ultimaker",
    builtIn: false,
    reachable: true,
    tools: [
      { name: "ultimaker_printer_status", changes: false },
      { name: "ultimaker_print_start", changes: true },
      { name: "ultimaker_says_nothing", changes: true },
    ],
  })
})

test("a server that did not answer is listed as not reachable, without tools", () => {
  assert.deepEqual(listedServer("juicebar", undefined), { name: "juicebar", builtIn: false, reachable: false, tools: [] })
  assert.equal(listedServer("genui", []).builtIn, true)
})

test("every server of the settings is asked, in their order, and one that fails does not hide the others", async () => {
  const settings = {
    GENUI_MCP_URL: "http://genui-mcp:8080/mcp",
    APP_MCP_SERVERS: "ultimaker=http://ultimaker-api:8080/mcp,juicebar=http://juicebar-api:8080/mcp",
  }
  const asked: Array<string> = []
  const servers = await listServers(settings, async (url) => {
    asked.push(url)
    if (url.includes("ultimaker")) throw new Error("ECONNREFUSED")
    return [{ name: url.includes("genui") ? "genui_machine_list" : "juicebar_status", metadata: readOnly }]
  })
  assert.deepEqual(
    servers.map(({ name, reachable, tools }) => [name, reachable, tools.length]),
    [
      ["genui", true, 1],
      ["ultimaker", false, 0],
      ["juicebar", true, 1],
    ],
  )
  assert.equal(asked.length, 3)
  // The address of a server never reaches the browser.
  assert.doesNotMatch(JSON.stringify(servers), /http/)
})

test("without further servers the list is the backend alone", async () => {
  const servers = await listServers({}, async () => [])
  assert.deepEqual(
    servers.map((server) => server.name),
    ["genui"],
  )
})
