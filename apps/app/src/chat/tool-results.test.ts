import assert from "node:assert/strict"
import { test } from "node:test"

import { backendTools, forModel, jsonOf, toolLabel } from "./tool-results.ts"
import type { ChatTool } from "./tool-results.ts"

const tools: ReadonlyArray<ChatTool> = [
  ...backendTools,
  { name: "genui_machine_list", label: { running: "Reading", done: "Read", failed: "Failed to read" } },
  { name: "genui_machine_show" },
  { name: "genui_span_list", cardOnly: true },
]

test("a language model gets every tool but the ones only a card calls", () => {
  const listed = ["genui_describe_server", "genui_machine_list", "genui_machine_show", "genui_span_list"].map(
    (name) => ({ name }),
  )
  assert.deepEqual(
    forModel(listed, tools).map((tool) => tool.name),
    ["genui_describe_server", "genui_machine_list", "genui_machine_show"],
  )
})

test("a tool the chat does not know is for the language model", () => {
  assert.deepEqual(forModel([{ name: "genui_alarm_list" }], tools), [{ name: "genui_alarm_list" }])
})

test("a call is called what its card says, and by its name where no card says anything", () => {
  assert.equal(toolLabel("genui_machine_list", tools).done, "Read")
  assert.equal(toolLabel("genui_get_skill_guide", tools).done, "Read the guide of the backend")
  assert.deepEqual(toolLabel("genui_machine_show", tools), {
    running: "Running genui_machine_show",
    done: "Ran genui_machine_show",
    failed: "Failed to run genui_machine_show",
  })
  assert.equal(toolLabel("genui_alarm_list", tools).failed, "Failed to run genui_alarm_list")
})

test("the values of a result are its JSON, and anything else is none", () => {
  assert.deepEqual(jsonOf('{"machines":[]}'), { machines: [] })
  assert.equal(jsonOf("genui is the generative UI backend"), null)
  assert.equal(jsonOf(undefined), null)
})
