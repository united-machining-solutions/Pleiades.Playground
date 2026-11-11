import assert from "node:assert/strict"
import { test } from "node:test"

import { CARD_MIME_TYPE } from "./card-file.ts"
import { MACHINE_CARD_URI, server } from "./server.ts"

type Listed = {
  tools?: Array<{ name: string; _meta?: { ui?: { resourceUri?: string } } }>
  resources?: Array<{ uri: string; mimeType?: string; _meta?: { ui?: { prefersBorder?: boolean } } }>
}

/** One request as a host sends it, and the result of the answer. */
async function ask(method: string): Promise<Listed> {
  const response = await server.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
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

test("the machine card is a resource that a host reads as an MCP App", async () => {
  const { resources = [] } = await ask("resources/list")
  const card = resources.find((resource) => resource.uri === MACHINE_CARD_URI)
  assert.equal(card?.mimeType, CARD_MIME_TYPE)
  // The card draws its own frame and says so.
  assert.equal(card?._meta?.ui?.prefersBorder, false)
})
