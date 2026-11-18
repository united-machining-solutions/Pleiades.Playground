import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { test } from "node:test"

import { CARD_MIME_TYPE } from "./card-file.ts"
import { MACHINE_CARD_URI, SPAN_LIST_TOOL } from "./cards/machine.names.ts"
import { MEASUREMENT_CARD_URI, MEASUREMENT_SERIES_TOOL } from "./cards/measurement.ts"
import { NOTIFICATION_CARD_URI } from "./cards/notification.ts"
import { server } from "./server.ts"

type Listed = {
  tools?: Array<{
    name: string
    inputSchema?: { properties?: Record<string, { pattern?: string }> }
    _meta?: { ui?: { resourceUri?: string; visibility?: Array<string> } }
  }>
  resources?: Array<{ uri: string; mimeType?: string; _meta?: { ui?: { prefersBorder?: boolean } } }>
  isError?: boolean
  content?: Array<{ type: string; text?: string }>
}

/** One request as a host sends it, and the result of the answer. */
async function ask(method: string, params?: unknown): Promise<Listed> {
  const response = await server.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  )
  const body = await response.text()
  // The answer is JSON, or one event of a stream that carries it.
  const json = body.startsWith("{") ? body : body.split("\n").find((line) => line.startsWith("data: "))?.slice(6)
  return JSON.parse(json ?? "{}").result ?? {}
}

test("the tool that shows a machine links the machine card, and the list links none", async () => {
  const { tools = [] } = await ask("tools/list")
  const linkOf = (name: string) => tools.find((tool) => tool.name === name)?._meta?.ui?.resourceUri
  assert.equal(linkOf("genui_machine_show"), MACHINE_CARD_URI)
  assert.equal(linkOf("genui_machine_list"), undefined)
})

test("the spans of a band are for a card: a host does not offer that tool to its language model", async () => {
  const { tools = [] } = await ask("tools/list")
  assert.deepEqual(tools.find((tool) => tool.name === SPAN_LIST_TOOL)?._meta?.ui?.visibility, ["app"])
  // The tools a model calls say nothing about who sees them, which means everybody.
  assert.equal(tools.find((tool) => tool.name === "genui_machine_show")?._meta?.ui?.visibility, undefined)
})

test("the tools that take a machine take every machine id the MQTT binding allows", async () => {
  const { tools = [] } = await ask("tools/list")
  for (const name of ["genui_machine_show", SPAN_LIST_TOOL, "genui_measurement_list", "genui_notification_list"]) {
    // The rule reaches a caller as a pattern, and the server checks what comes in against it.
    assert.equal(tools.find((tool) => tool.name === name)?.inputSchema?.properties?.machine?.pattern, "^[^/+#]+$")
  }
})

test("a tool refuses a time zone it does not know, in words, before it reads anything", async () => {
  for (const [name, more] of [
    ["genui_machine_list", {}],
    ["genui_machine_show", { machine: "P-04" }],
    ["genui_measurement_list", {}],
    ["genui_notification_list", { machine: "P-04" }],
  ] as const) {
    const result = await ask("tools/call", { name, arguments: { ...more, timeZone: "Mars/Olympus" } })
    assert.equal(result.isError, true)
    assert.match(result.content?.[0]?.text ?? "", /"Mars\/Olympus" is not a time zone this server knows/)
  }
})

test("the list of measurements links the measurement card, a resource a host reads as an MCP App", async () => {
  const { tools = [] } = await ask("tools/list")
  assert.equal(tools.find((tool) => tool.name === "genui_measurement_list")?._meta?.ui?.resourceUri, MEASUREMENT_CARD_URI)
  const { resources = [] } = await ask("resources/list")
  assert.equal(resources.find((resource) => resource.uri === MEASUREMENT_CARD_URI)?.mimeType, CARD_MIME_TYPE)
  // The series are for a graph: a host does not offer that tool to its language model.
  assert.deepEqual(tools.find((tool) => tool.name === MEASUREMENT_SERIES_TOOL)?._meta?.ui?.visibility, ["app"])
})

test("the list of notifications links the notification card, a resource a host reads as an MCP App", async () => {
  const { tools = [] } = await ask("tools/list")
  const listed = tools.find((tool) => tool.name === "genui_notification_list")
  assert.equal(listed?._meta?.ui?.resourceUri, NOTIFICATION_CARD_URI)
  // Nothing hides it from the language model: the card has no tool of its own that only a card calls.
  assert.equal(listed?._meta?.ui?.visibility, undefined)
  const { resources = [] } = await ask("resources/list")
  assert.equal(resources.find((resource) => resource.uri === NOTIFICATION_CARD_URI)?.mimeType, CARD_MIME_TYPE)
})

test("the list of notifications refuses a hours value beyond the 24 hours that are read, before it reads anything", async () => {
  const result = await ask("tools/call", { name: "genui_notification_list", arguments: { machine: "P-04", hours: 48 } })
  assert.equal(result.isError, true)
})

test("the machine card is a resource that a host reads as an MCP App", async () => {
  const { resources = [] } = await ask("resources/list")
  const card = resources.find((resource) => resource.uri === MACHINE_CARD_URI)
  assert.equal(card?.mimeType, CARD_MIME_TYPE)
  // The card draws its own frame and says so.
  assert.equal(card?._meta?.ui?.prefersBorder, false)
})

/** The files of a folder that end in `ending`, each with its text. The tests among them are left out. */
function sources(folder: string, ending: string): Array<{ file: string; text: string }> {
  const url = new URL(folder, import.meta.url)
  return readdirSync(url)
    .filter((file) => file.endsWith(ending) && !file.endsWith(`.test${ending}`))
    .map((file) => ({ file, text: readFileSync(new URL(file, url), "utf8") }))
}

test("a tool that is kept from the language model is called by a card file", async () => {
  const { tools = [] } = await ask("tools/list")
  const cardFiles = sources("../ui/", ".tsx")
  const modules = sources("./cards/", ".ts")
  const checked: Array<string> = []
  for (const { name, _meta } of tools) {
    const visibility = _meta?.ui?.visibility
    if (visibility === undefined || visibility.includes("model")) continue
    checked.push(name)
    // A card file asks the server through its host, `callServerTool({ name: ... })`, and names the tool
    // there itself (as a string) or by a constant of cards/ that holds its name. A comment or a string
    // that only mentions the tool is not a call.
    const constants = modules.flatMap(({ text }) =>
      [...text.matchAll(/export const (\w+) = "([^"]+)"/g)].flatMap((found) => (found[2] === name && found[1] ? [found[1]] : [])),
    )
    const literal = `(["'\`])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1`
    const called = new RegExp(`callServerTool\\(\\s*\\{[^}]*?\\bname:\\s*(?:${[literal, ...constants].join("|")})(?![\\w$])`)
    assert.ok(
      cardFiles.some(({ text }) => called.test(text)),
      `${name} is kept from the language model of a host (visibility: ${JSON.stringify(visibility)}), so only a card can call it, and no card file under ui/ does: in a host other than the example application nobody calls it. Call it from the card file with app.callServerTool, as ui/machine.tsx calls ${SPAN_LIST_TOOL}. The name the two share goes into cards/<name>.names.ts, which imports nothing.`,
    )
  }
  // The band of the machine card is the example: if it is not among them, this test looked at nothing.
  assert.ok(checked.includes(SPAN_LIST_TOOL))
})
