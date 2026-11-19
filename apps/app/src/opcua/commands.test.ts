import assert from "node:assert/strict"
import { test } from "node:test"

import { commandsFor, completion, endpointOf, matching, readTyped, stepped, toolCommand, usage } from "./commands.ts"

const all = commandsFor(true)
const withoutOpcUa = commandsFor(false)

test("a question without a slash is sent as it is", () => {
  assert.deepEqual(readTyped("  Which machine stands still?  ", all), { kind: "question", text: "Which machine stands still?" })
})

test("a command becomes its question", () => {
  const typed = readTyped("/mapping A0280O0001", all)
  assert.equal(typed.kind, "question")
  assert.match(typed.kind === "question" ? typed.text : "", /mapping of the OPC UA machine A0280O0001/)
})

test("the name of a command is read in any case, the argument as it is", () => {
  const typed = readTyped("/Discover opc.tcp://Machine-7:4840", all)
  assert.match(typed.kind === "question" ? typed.text : "", /opc\.tcp:\/\/Machine-7:4840/)
})

test("a machine alone gets the port of OPC UA, and the model asks if it does not answer", () => {
  assert.deepEqual(endpointOf("A0280O0001"), { url: "opc.tcp://A0280O0001:4840", assumed: true })
  assert.deepEqual(endpointOf("opc.tcp://10.0.0.7:4841"), { url: "opc.tcp://10.0.0.7:4841", assumed: false })
  const typed = readTyped("/discover A0280O0001", all)
  const text = typed.kind === "question" ? typed.text : ""
  assert.match(text, /opc\.tcp:\/\/A0280O0001:4840/)
  assert.match(text, /ask me for the endpoint/)
})

test("an address is scanned as it is, without the default", () => {
  const typed = readTyped("/discover opc.tcp://10.0.0.7:4841", all)
  const text = typed.kind === "question" ? typed.text : ""
  assert.match(text, /^Discover the OPC UA server at opc\.tcp:\/\/10\.0\.0\.7:4841\./)
  assert.doesNotMatch(text, /4840/)
})

test("an address may be a gateway: its machines are listed first, and its slash at the end is dropped", () => {
  assert.deepEqual(endpointOf("opc.tcp://opcgateway:11878/"), { url: "opc.tcp://opcgateway:11878", assumed: false })
  const typed = readTyped("/discover opc.tcp://opcgateway:11878/", all)
  const text = typed.kind === "question" ? typed.text : ""
  assert.match(text, /opc\.tcp:\/\/opcgateway:11878\. It may be a gateway/)
  assert.match(text, /list its machines first/)
  assert.doesNotMatch(text, /4840/)
})

test("a mistyped opc.tcp before an address is written right, and the address gets no second port", () => {
  assert.deepEqual(endpointOf("opc.tcp//opcgateway:11878"), { url: "opc.tcp://opcgateway:11878", assumed: false })
  assert.deepEqual(endpointOf("opc.tcp:/opcgateway:11878"), { url: "opc.tcp://opcgateway:11878", assumed: false })
  assert.deepEqual(endpointOf("OPC.TCP:///opcgateway:11878/"), { url: "opc.tcp://opcgateway:11878", assumed: false })
  assert.deepEqual(endpointOf("opc.tcp:host:4841"), { url: "opc.tcp://host:4841", assumed: false })
  const typed = readTyped("/discover opc.tcp//opcgateway:11878", all)
  const text = typed.kind === "question" ? typed.text : ""
  assert.match(text, /^Discover the OPC UA server at opc\.tcp:\/\/opcgateway:11878\./)
  assert.doesNotMatch(text, /4840|opc\.tcp:\/\/opc\.tcp/)
})

test("a host with a port but no scheme is an address, not a machine", () => {
  assert.deepEqual(endpointOf("opcgateway:11878"), { url: "opc.tcp://opcgateway:11878", assumed: false })
  assert.deepEqual(endpointOf("10.0.0.7:4841"), { url: "opc.tcp://10.0.0.7:4841", assumed: false })
  assert.deepEqual(endpointOf("[fd00::7]:4841"), { url: "opc.tcp://[fd00::7]:4841", assumed: false })
  assert.deepEqual(endpointOf("opcgateway:11878/UA/Server"), { url: "opc.tcp://opcgateway:11878/UA/Server", assumed: false })
  assert.deepEqual(endpointOf("opcgateway"), { url: "opc.tcp://opcgateway:4840", assumed: true })
})

test("/help asks the model nothing", () => {
  assert.deepEqual(readTyped("/help", all), { kind: "help" })
})

test("a command without its argument says what is missing", () => {
  const typed = readTyped("/mapping", all)
  assert.equal(typed.kind, "incomplete")
  assert.equal(typed.kind === "incomplete" ? usage(typed.command) : "", "/mapping <serial number>")
})

test("a name no command has is unknown, and so is an OPC UA command without the adapter", () => {
  assert.deepEqual(readTyped("/frobnicate", all), { kind: "unknown", name: "frobnicate" })
  assert.deepEqual(readTyped("/opcua", withoutOpcUa), { kind: "unknown", name: "opcua" })
})

test("while the name is typed, the commands that begin with it are offered", () => {
  assert.deepEqual(
    matching("/", withoutOpcUa).map((command) => command.name),
    ["help", "machines", "warnings"],
  )
  assert.deepEqual(
    matching("/ma", all).map((command) => command.name),
    ["machines", "mapping"],
  )
  assert.deepEqual(matching("/mapping A02", all), [], "after the name the list closes")
  assert.deepEqual(matching("mapping", all), [], "without a slash there is no list")
})

test("Tab completes the marked command, and the list closes behind it", () => {
  const [mapping] = matching("/map", all)
  assert.ok(mapping)
  const completed = completion(mapping)
  assert.equal(completed, "/mapping ")
  assert.deepEqual(matching(completed, all), [], "the space closes the list")
  assert.equal(readTyped(`${completed}A02`, all).kind, "question", "the argument follows")
})

const show = toolCommand("genui", { name: "genui_machine_show", summary: "Show one machine." })
const list = toolCommand("genui", { name: "genui_machine_list", summary: "" })
const withTools = [...all, show, list]

test("a tool of a server is a command that asks the model to take it, with or without what for", () => {
  assert.deepEqual(readTyped("/genui_machine_show A1121O0001", withTools), {
    kind: "question",
    text: "Use the tool genui_machine_show: A1121O0001",
  })
  assert.deepEqual(readTyped("/genui_machine_list", withTools), { kind: "question", text: "Use the tool genui_machine_list." })
  assert.equal(usage(show), "/genui_machine_show [what for]")
  assert.equal(show.summary, "Show one machine.")
  assert.equal(list.summary, "A tool of genui.", "a tool that says nothing names its server")
})

test("a tool is found by a part of its name too, after the names that begin with it", () => {
  assert.deepEqual(
    matching("/machine", withTools).map((command) => command.name),
    ["machines", "genui_machine_show", "genui_machine_list"],
  )
  assert.deepEqual(
    matching("/machine_sh", withTools).map((command) => command.name),
    ["genui_machine_show"],
  )
  assert.deepEqual(
    matching("/genui_", withTools).map((command) => command.name),
    ["genui_machine_show", "genui_machine_list"],
  )
  assert.deepEqual(matching("/achine", withTools), [], "a part is found from its beginning only")
})

test("the arrow keys go round the list", () => {
  assert.equal(stepped(0, 1, 3), 1)
  assert.equal(stepped(2, 1, 3), 0, "past the last to the first")
  assert.equal(stepped(0, -1, 3), 2, "before the first to the last")
  assert.equal(stepped(0, 1, 0), 0, "an empty list has nothing to mark")
})
