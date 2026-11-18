import assert from "node:assert/strict"
import { test } from "node:test"

import { z } from "zod"

import { PROPOSE_PAGE_TOOL } from "../pages/proposal.ts"
import { proposePageTool } from "./propose-page.ts"
import type { ChatTool } from "./tool-results.ts"

// The chat's list as the tool reads it: one tool of the backend without a card, two the chat draws,
// one only a card calls, and the proposal itself.
const tools: ReadonlyArray<ChatTool> = [
  { name: "genui_get_skill_guide" },
  { name: "genui_machine_list", draw: () => "list" },
  { name: "genui_machine_show", draw: () => "card" },
  { name: "genui_span_list", cardOnly: true, draw: () => "band" },
  { name: PROPOSE_PAGE_TOOL, saveAsPage: false, draw: () => "proposal" },
]

const tool = proposePageTool(tools)

/** The JSON schema a language model reads. */
const schema = z.toJSONSchema(tool.inputSchema) as unknown as {
  properties: { title: object; parts: { items: { properties: object } } }
}
const written = JSON.stringify(schema)

test("the tool is named as the tools of the stack are, <area>_<subject>_<action>", () => {
  assert.equal(tool.name, "app_page_propose")
  assert.match(tool.name, /^[a-z]+_[a-z]+_[a-z]+$/)
})

test("its description and its schema name the tools a page can call, and no other", () => {
  for (const text of [tool.description, written]) {
    assert.ok(text.includes("genui_machine_list, genui_machine_show"), text)
    for (const other of ["genui_get_skill_guide", "genui_span_list", PROPOSE_PAGE_TOOL]) {
      assert.ok(!text.includes(other), `${other} in ${text}`)
    }
  }
})

test("its description says that the model cannot keep the page and writes no value", () => {
  assert.match(tool.description, /you cannot keep it yourself/)
  assert.match(tool.description, /The page keeps no value/)
  assert.match(tool.description, /take every argument, a machine id above all, from what they returned/)
})

test("its input is a title and the parts, a tool and its arguments each, and nothing else", () => {
  assert.deepEqual(Object.keys(schema.properties), ["title", "parts"])
  assert.deepEqual(Object.keys(schema.properties.parts.items.properties), ["tool", "args"])
})

test("called, it gives back the checked recipe and what it left out", async () => {
  const result = await tool.execute?.({
    title: "Shop floor",
    parts: [{ tool: "genui_machine_list" }, { tool: "genui_span_list", args: { machine: "P-04" } }],
  })
  assert.deepEqual(result, {
    recipe: { title: "Shop floor", parts: [{ tool: "genui_machine_list", args: {} }] },
    leftOut: [
      {
        part: 2,
        tool: "genui_span_list",
        reason: "A page cannot call genui_span_list. The tools a page can call are genui_machine_list, genui_machine_show.",
      },
    ],
  })
})

test("called with nothing a page can hold, it fails with the reasons", async () => {
  await assert.rejects(
    async () => tool.execute?.({ title: "Spans", parts: [{ tool: "genui_span_list" }] }),
    /^Error: No part is left, so there is no page to propose\. Part 1: A page cannot call genui_span_list\./,
  )
})
