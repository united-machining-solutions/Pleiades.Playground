import assert from "node:assert/strict"
import { test } from "node:test"

import { toolDefinition } from "@tanstack/ai"
import { createMCPServer } from "@tanstack/ai-mcp/server"
import { z } from "zod"

import { card, toolsOf } from "./card.ts"
import { readOnly, text } from "./tool.ts"

// Two cards whose tools differ, as the tools of two real cards do: in their input, and one of them
// in having an output. With one card the type check cannot tell whether a second one fits.

const counted = z.object({ machine: z.string(), count: z.number() })

const first = card({
  tools: [
    toolDefinition({
      name: "probe_first_show",
      description: "A tool with an input of its own and an output.",
      inputSchema: z.object({ machine: z.string() }),
      outputSchema: counted,
      metadata: { title: "Show first", annotations: readOnly },
    }).server((input) => ({ machine: input.machine, count: 1 })),
  ],
  describes: ["- probe_first_show: the first."],
  guide: "## First",
})

const second = card({
  tools: [
    toolDefinition({
      name: "probe_second_list",
      description: "A tool with another input and no output.",
      inputSchema: z.object({ hours: z.number().optional() }),
      metadata: { title: "List second", annotations: readOnly },
    }).server(() => text("second")),
    toolDefinition({
      name: "probe_second_show",
      description: "A second tool of the same card.",
      inputSchema: z.object({}),
      metadata: { title: "Show second", annotations: readOnly },
    }).server(() => text("second")),
  ],
  describes: ["- probe_second_list: the second."],
  guide: "## Second",
})

test("the tools of two cards that differ are one list, in the order of the cards, and a server takes it", async () => {
  const tools = toolsOf([first, second] as const)
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["probe_first_show", "probe_second_list", "probe_second_show"],
  )

  // That this compiles is half of the test: the type check runs over this file too.
  const server = createMCPServer({ name: "probe", version: "0.0.0", tools: [...tools] })
  const response = await server.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  )
  const body = await response.text()
  const json = body.startsWith("{") ? body : body.split("\n").find((line) => line.startsWith("data: "))?.slice(6)
  const listed: Array<{ name: string }> = JSON.parse(json ?? "{}").result?.tools ?? []
  assert.deepEqual(
    listed.map((tool) => tool.name),
    ["probe_first_show", "probe_second_list", "probe_second_show"],
  )
})
