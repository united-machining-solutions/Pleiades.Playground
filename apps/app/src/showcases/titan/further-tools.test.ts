import assert from "node:assert/strict"
import { test } from "node:test"

import { furtherInstructions, readingTools, serversOf } from "./further-tools.ts"

const reads = { mcp: { annotations: { readOnlyHint: true } } }
const listed = [
  { name: "juicebar_describe_server", description: "Describe this MCP server.", metadata: reads },
  { name: "juicebar_get_skill_guide", description: "Return the skill guide.", metadata: reads },
  { name: "juicebar_drinks_list", description: "List the drinks the juice bar can mix now, each with its id. Only drinks whose ingredients are installed are listed.", inputSchema: { type: "object", properties: {} }, metadata: reads },
  { name: "juicebar_drink_get", description: "Get one drink of the card by its id.", inputSchema: { type: "object", properties: { drinkId: { type: "string" } }, required: ["drinkId"] }, metadata: reads },
  { name: "juicebar_order_create", description: "Order a drink.", inputSchema: { type: "object", properties: { drinkId: { type: "string" } } }, metadata: { mcp: { annotations: { readOnlyHint: false } } } },
  { name: "juicebar_unmarked", description: "Says nothing about itself." },
]

test("Titan takes the tools of a server that only read, and none that can start or change something", () => {
  const tools = readingTools("juicebar", listed)
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["juicebar_drinks_list", "juicebar_drink_get"],
  )
  assert.deepEqual(tools[1]?.parameters, { type: "object", properties: { drinkId: { type: "string" } }, required: ["drinkId"] })
  assert.equal(tools[0]?.server, "juicebar")
})

test("a tool without a schema of an object takes no arguments", () => {
  assert.deepEqual(readingTools("x", [{ name: "x_list", metadata: reads }])[0]?.parameters, { type: "object", properties: {} })
  assert.deepEqual(readingTools("x", [{ name: "x_list", inputSchema: "none", metadata: reads }])[0]?.parameters, { type: "object", properties: {} })
})

test("only a server the app has can be switched on", () => {
  assert.deepEqual(serversOf({ servers: ["juicebar", "made-up", 7] }, ["ultimaker", "juicebar"]), ["juicebar"])
  assert.deepEqual(serversOf({ servers: "juicebar" }, ["juicebar"]), [])
  assert.deepEqual(serversOf({}, ["juicebar"]), [])
})

test("Titan is told what the servers that are on can read, and that it cannot order", () => {
  const told = furtherInstructions(readingTools("juicebar", listed)) ?? ""
  assert.match(told, /juicebar:\n- juicebar_drinks_list: List the drinks the juice bar can mix now, each with its id\.\n- juicebar_drink_get: /)
  assert.match(told, /you cannot order, start or change anything yourself/)
  assert.equal(furtherInstructions([]), undefined)
})

test("a tool under the name of another server, or of one of Titan's own, is not taken", () => {
  const tools = readingTools("juicebar", [
    { name: "genui_machine_list", metadata: reads },
    { name: "ultimaker_job_list", metadata: reads },
    { name: "juicebar_status", metadata: reads },
    { name: "juicebar_with.a.dot", metadata: reads },
  ])
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["juicebar_status"],
  )
})
