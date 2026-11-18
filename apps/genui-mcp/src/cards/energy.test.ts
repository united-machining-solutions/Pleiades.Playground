import assert from "node:assert/strict"
import { test } from "node:test"

import { CARD_MIME_TYPE } from "../card-file.ts"
import { server } from "../server.ts"
import { ENERGY_CARD_URI, ENERGY_SERIES_TOOL } from "./energy.names.ts"

type Listed = {
  tools?: Array<{
    name: string
    inputSchema?: { properties?: Record<string, { items?: { pattern?: string } }> }
    _meta?: { ui?: { resourceUri?: string; visibility?: Array<string> } }
  }>
  resources?: Array<{ uri: string; mimeType?: string }>
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
  const json = body.startsWith("{") ? body : body.split("\n").find((line) => line.startsWith("data: "))?.slice(6)
  return JSON.parse(json ?? "{}").result ?? {}
}

test("the energy links the energy card, and its lines are for the card alone", async () => {
  const { tools = [] } = await ask("tools/list")
  const shown = tools.find((tool) => tool.name === "genui_energy_show")
  assert.equal(shown?._meta?.ui?.resourceUri, ENERGY_CARD_URI)
  assert.equal(shown?._meta?.ui?.visibility, undefined)
  assert.deepEqual(tools.find((tool) => tool.name === ENERGY_SERIES_TOOL)?._meta?.ui?.visibility, ["app"])
  // Both take every machine id the MQTT binding allows.
  for (const tool of [shown, tools.find((one) => one.name === ENERGY_SERIES_TOOL)]) {
    assert.equal(tool?.inputSchema?.properties?.machines?.items?.pattern, "^[^/+#]+$")
  }
  const { resources = [] } = await ask("resources/list")
  assert.equal(resources.find((resource) => resource.uri === ENERGY_CARD_URI)?.mimeType, CARD_MIME_TYPE)
})

test("the energy refuses a time zone it does not know, in words, before it reads anything", async () => {
  const zone = await ask("tools/call", { name: "genui_energy_show", arguments: { timeZone: "Mars/Olympus" } })
  assert.equal(zone.isError, true)
  assert.match(zone.content?.[0]?.text ?? "", /"Mars\/Olympus" is not a time zone this server knows/)
})
