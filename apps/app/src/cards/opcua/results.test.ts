import assert from "node:assert/strict"
import { test } from "node:test"

import { mappingOf, needingALook, proposalOf, securityOf, serverListOf, shownValue } from "./results.ts"

const server = {
  serialNumber: "A0280O0001",
  endpoint: { url: "opc.tcp://opc-simulator:4840", securityMode: "SignAndEncrypt", securityPolicy: "Aes256_Sha256_RsaPss" },
  state: "Connected",
  profiles: ["Core"],
  mapping: { ok: 11, derived: 2, unclear: 2, mismatch: 0, missing: 3, needsAttention: true },
  needsRescan: false,
}

test("a server list of the adapter is read, anything else is not", () => {
  assert.equal(serverListOf(JSON.stringify({ servers: [server] }))?.servers[0]?.serialNumber, "A0280O0001")
  assert.deepEqual(serverListOf(JSON.stringify({ servers: [] }))?.servers, [])
  assert.equal(serverListOf(JSON.stringify({ servers: [{ serialNumber: "x" }] })), null)
  assert.equal(serverListOf("not json"), null)
})

test("a mapping is read with its rows", () => {
  const rows = [
    { path: "State.MachineryItemState", area: "umati", state: "Derived", detail: "From the program state." },
    { path: "Identification.Manufacturer", area: "umati", state: "Ok", value: "TRUMPF" },
  ]
  const mapping = mappingOf(JSON.stringify({ server, rows }))
  assert.equal(mapping?.rows.length, 2)
  assert.deepEqual(needingALook(mapping?.rows ?? []).map((row) => row.path), ["State.MachineryItemState"])
  assert.equal(mappingOf(JSON.stringify({ server, rows: [{ path: "x", state: "Fine" }] })), null)
})

test("a proposal is read, refused or not", () => {
  const refused = proposalOf(
    JSON.stringify({ accepted: false, serialNumber: "P-1", endpoint: server.endpoint, profiles: [], problems: ["no node"], rows: [], replaces: false }),
  )
  assert.equal(refused?.accepted, false)
  assert.deepEqual(refused?.problems, ["no node"])
})

test("a value is shown with its unit and without binary noise", () => {
  assert.equal(shownValue({ path: "p", area: "umati", state: "Ok", value: 32440, unit: "watt" }), "32440 watt")
  assert.equal(shownValue({ path: "p", area: "umati", state: "Ok", value: 64759068.00036, unit: "second" }), "64759068 second")
  assert.equal(shownValue({ path: "p", area: "umati", state: "Ok", value: 0.5, unit: "one" }), "0.5 one")
  assert.equal(shownValue({ path: "p", area: "umati", state: "Missing" }), "–")
})

test("the security of an endpoint is said in words", () => {
  assert.equal(securityOf(server.endpoint as never), "Encrypted, Aes256_Sha256_RsaPss")
  assert.equal(securityOf({ securityMode: "None", securityPolicy: "None" }), "No security")
})
