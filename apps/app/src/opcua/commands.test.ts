import assert from "node:assert/strict"
import { test } from "node:test"

import { commandsFor, endpointOf, matching, readTyped, usage } from "./commands.ts"

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
