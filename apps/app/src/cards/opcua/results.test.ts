import assert from "node:assert/strict"
import { test } from "node:test"

import {
  addedInWords,
  chosenRows,
  doneInWords,
  inDoubt,
  machineListOf,
  mappingOf,
  needingALook,
  proposalOf,
  sameChoice,
  securityOf,
  serverListOf,
  shownProfiles,
  shownValue,
  userStep,
} from "./results.ts"
import type { MappingRow, ProfileCheck } from "./results.ts"

const server = {
  serialNumber: "A0280O0001",
  endpoint: { url: "opc.tcp://opc-simulator:4840", securityMode: "SignAndEncrypt", securityPolicy: "Aes256_Sha256_RsaPss" },
  state: "Running",
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

test("the machines of a gateway are read, anything else is not", () => {
  const list = machineListOf(
    JSON.stringify({
      url: "opc.tcp://opcgateway:11878",
      gateway: true,
      machines: [
        { node: "nsu=urn:a;i=1", path: "opcsim/Machines/TruLaser", displayName: "TruLaser", serialNumber: "A0280O0001", added: true },
        { node: "nsu=urn:b;i=1", path: "localhost/Machines/TruBend", displayName: "TruBend", added: false },
      ],
    }),
  )
  assert.equal(list?.gateway, true)
  assert.deepEqual(list?.machines.map((machine) => machine.serialNumber ?? "none"), ["A0280O0001", "none"])
  assert.equal(machineListOf(JSON.stringify({ url: "x", gateway: false, machines: [{ node: "n" }] })), null)
  assert.equal(machineListOf(JSON.stringify({ servers: [] })), null)
})

test("a server on the session of a gateway names the machines it shares it with", () => {
  const shared = { ...server, machineNode: "nsu=urn:a;i=1", sessionSharedWith: ["B0000X0002"] }
  assert.deepEqual(serverListOf(JSON.stringify({ servers: [shared] }))?.servers[0]?.sessionSharedWith, ["B0000X0002"])
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
  assert.equal(
    securityOf({ securityMode: "SignAndEncrypt", securityPolicy: "Aes256_Sha256_RsaPss", user: "operator" }),
    "Encrypted, Aes256_Sha256_RsaPss, user operator",
  )
})

test("the endpoints card asks for a user only where the server takes one", () => {
  assert.equal(userStep({ needsUser: true, acceptsUser: true }), "required")
  assert.equal(userStep({ needsUser: true, acceptsUser: true, user: "operator" }), "optional")
  assert.equal(userStep({ needsUser: false, acceptsUser: true }), "optional")
  assert.equal(userStep({ needsUser: true, acceptsUser: false }), "none")
  assert.equal(userStep({}), "none")
})

test("the core is shown always, and of the other profiles those a server offers", () => {
  const check = (name: string, fulfilled: boolean, offered: boolean, mandatory = false) => ({
    name,
    mandatory,
    fulfilled,
    offered,
    missing: fulfilled ? [] : ["x"],
    instances: [],
  })
  const shown = shownProfiles([
    check("Core", false, true, true),
    check("MonitoringExtended", true, true),
    check("ChannelMonitoring", false, true),
    check("Spindle", false, false),
  ])
  assert.equal(shown.core?.name, "Core")
  assert.deepEqual(shown.fulfilled.map((one) => one.name), ["MonitoringExtended"])
  assert.deepEqual(shown.incomplete.map((one) => one.name), ["ChannelMonitoring"])
  assert.deepEqual(shownProfiles(undefined), { core: undefined, fulfilled: [], incomplete: [] })
})

test("a chip of a state chooses the rows of that state", () => {
  const rows: Array<MappingRow> = [
    { path: "Notification.ActiveAlerts", area: "umati", state: "Missing", detail: "No alarms" },
    { path: "Identification.SerialNumber", area: "umati", state: "Ok", value: "A1121O0001" },
    { path: "Production.ActiveProgram", area: "umati", state: "Missing" },
  ]
  assert.deepEqual(
    chosenRows(rows, { state: "Missing" }, undefined).map((row) => row.path),
    ["Notification.ActiveAlerts", "Production.ActiveProgram"],
  )
  assert.deepEqual(chosenRows(rows, { state: "Mismatch" }, undefined), [])
})

test("a chip of a profile chooses what it lacks, also an element the scan has no row for", () => {
  const rows: Array<MappingRow> = [
    { path: "Notification.ActiveAlerts", area: "umati", state: "Missing", detail: "No alarms" },
    { path: "Notification.ActiveAlerts", area: "oem", state: "Ok" },
  ]
  const checks: Array<ProfileCheck> = [
    { name: "Core", mandatory: true, fulfilled: false, offered: true, missing: ["Notification.ActiveAlerts"], instances: [] },
    { name: "Energy", mandatory: false, fulfilled: false, offered: true, missing: ["Energy.Total"], instances: [] },
  ]
  assert.deepEqual(chosenRows(rows, { profile: "Core" }, checks), [rows[0]])
  assert.deepEqual(chosenRows(rows, { profile: "Energy" }, checks), [{ path: "Energy.Total", area: "umati", state: "Missing" }])
  assert.deepEqual(chosenRows(rows, { profile: "Unknown" }, checks), [])
})

test("the same chip is the same choice, and no choice equals only no choice", () => {
  assert.equal(sameChoice({ state: "Ok" }, { state: "Ok" }), true)
  assert.equal(sameChoice({ state: "Ok" }, { state: "Missing" }), false)
  assert.equal(sameChoice({ profile: "Core" }, { profile: "Core" }), true)
  assert.equal(sameChoice({ profile: "Core" }, { state: "Ok" }), false)
  assert.equal(sameChoice(null, undefined), true)
  assert.equal(sameChoice({ state: "Ok" }, null), false)
})

test("a mismatch and an unclear match are in doubt, a missing, derived or ok element is not", () => {
  const rows: Array<MappingRow> = [
    { path: "a", area: "umati", state: "Mismatch" },
    { path: "b", area: "umati", state: "Unclear" },
    { path: "c", area: "umati", state: "Derived" },
    { path: "d", area: "umati", state: "Missing" },
    { path: "e", area: "umati", state: "Ok" },
  ]
  assert.deepEqual(inDoubt(rows).map((row) => row.path), ["a", "b"])
  assert.deepEqual(inDoubt([]), [])
})

test("the toast after adding says the site the machine went on, as Home says it", () => {
  const proposal = { serialNumber: "A1121O0001", replaces: false }
  const sites = { ok: true as const, sites: [{ siteId: "north-plant", name: "North plant" }] }
  const placed = { ok: true as const, siteId: "north-plant", siteName: "North plant", already: false }
  assert.deepEqual(addedInWords(proposal, sites, placed), {
    title: "A1121O0001 added · North plant",
    description: "Its values appear on Home within seconds.",
  })
  assert.equal(doneInWords(proposal, sites, placed), "A1121O0001 is added on North plant. Its values appear on Home within seconds.")
})

test("the toast after adding says why the machine is on no site", () => {
  const proposal = { serialNumber: "A1121O0001", replaces: false }
  assert.deepEqual(addedInWords(proposal, { ok: true, sites: [] }, undefined), {
    title: "A1121O0001 added",
    description: "There is no site yet: put it on one with Add machine on Home.",
  })
  assert.equal(
    addedInWords(proposal, { ok: false, reason: "The app has no Sites API (SITES_API_URL is empty)." }, undefined).description,
    "It is on no site: The app has no Sites API (SITES_API_URL is empty).",
  )
  const refused = { ok: false as const, reason: "The site 'south-plant' is no longer there." }
  assert.equal(
    doneInWords(proposal, { ok: true, sites: [] }, refused),
    "A1121O0001 is added. It is on no site: The site 'south-plant' is no longer there. Put it on one with Add machine on Home.",
  )
  const already = { ok: true as const, siteId: "north-plant", siteName: "North plant", already: true }
  assert.equal(doneInWords(proposal, undefined, already), "A1121O0001 is added. It stood on North plant already, and stays there.")
})

test("a registration that replaces one is not added again", () => {
  const proposal = { serialNumber: "A1121O0001", replaces: true }
  assert.deepEqual(addedInWords(proposal, undefined, undefined), { title: "Registration of A1121O0001 replaced", description: undefined })
  assert.equal(doneInWords(proposal, undefined, undefined), "The registration of A1121O0001 is replaced.")
})
