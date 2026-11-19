import assert from "node:assert/strict"
import { test } from "node:test"

import { firstSentence, listServers, listedServer } from "./server-list.ts"

const readOnly = { mcp: { annotations: { readOnlyHint: true } } }

test("a server that answered is listed with its tools, and a tool that does not say it only reads is marked", () => {
  const server = listedServer("ultimaker", [
    { name: "ultimaker_printer_status", description: "The state of the printer. And more.", metadata: readOnly },
    { name: "ultimaker_print_start", metadata: { mcp: { title: "Start a print", annotations: { readOnlyHint: false } } } },
    { name: "ultimaker_says_nothing" },
  ])
  assert.deepEqual(server, {
    name: "ultimaker",
    builtIn: false,
    reachable: true,
    tools: [
      { name: "ultimaker_printer_status", summary: "The state of the printer.", changes: false },
      { name: "ultimaker_print_start", summary: "Start a print", changes: true },
      { name: "ultimaker_says_nothing", summary: "", changes: true },
    ],
  })
})

test("a tool is summed up by the first sentence of its description", () => {
  assert.equal(firstSentence("Show one machine: what it does now, as in genui_machine_list. Use it for one."), "Show one machine: what it does now, as in genui_machine_list.")
  assert.equal(firstSentence("Lists the jobs\nwith their state."), "Lists the jobs")
  assert.equal(firstSentence("Version 1.2 of the list, without an end"), "Version 1.2 of the list, without an end")
  assert.equal(firstSentence(undefined), "")
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
