import assert from "node:assert/strict"
import { test } from "node:test"

import { forModel } from "./card-tools.ts"

test("a language model gets every tool but the ones only a card calls", () => {
  const tools = ["genui_describe_server", "genui_machine_list", "genui_machine_show", "genui_span_list"].map((name) => ({
    name,
  }))
  assert.deepEqual(
    forModel(tools).map((tool) => tool.name),
    ["genui_describe_server", "genui_machine_list", "genui_machine_show"],
  )
})
