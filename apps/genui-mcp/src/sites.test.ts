import assert from "node:assert/strict"
import { afterEach, mock, test } from "node:test"

import type { Machine, MachineList } from "@pleiades/cards/machine/contract.ts"
import { siteList } from "@pleiades/cards/site/contract.ts"

import type { Placement, StoredSite } from "./apis.ts"
import { countsOf, listSites, sitesOf } from "./sites.ts"

afterEach(() => mock.restoreAll())

const asOf = "2026-11-17T09:30:00.000Z"
const secondsAgo = (seconds: number) => new Date(Date.parse(asOf) - seconds * 1000).toISOString()

/** A machine as genui_machine_list returns it, with what decides its state. */
function machine(
  machineId: string,
  doing: { itemState?: string; operationMode?: string; error?: boolean; silentFor?: number },
): Machine {
  const at = secondsAgo(doing.silentFor ?? 5)
  const reading = (path: string, value: string | null) => ({
    value,
    at,
    since: secondsAgo(600),
    sinceIsLowerBound: false,
    topic: `machines/${machineId}/umati/${path}`,
  })
  return {
    machine: machineId,
    identity: { manufacturer: null, model: null, serialNumber: null },
    connection: reading("Connection/State", "Running"),
    heartbeat: reading("Connection/Heartbeat", "42"),
    itemState: reading("State/Status/MachineryItemState", doing.itemState ?? "Executing"),
    operationMode: reading("State/Status/MachineryOperationMode", doing.operationMode ?? "Automatic"),
    program: reading("WorkMasterMonitoring/ActiveWorkMaster", "Part-17"),
    jobOrder: null,
    lastValueAt: at,
    notifications: doing.error
      ? [
          {
            correlationId: "c-1",
            notificationId: "E-17",
            severity: "Failure",
            level: "Error",
            title: "Spindle overload",
            raisedAt: secondsAgo(300),
            topic: `machines/${machineId}/events/notifications`,
          },
        ]
      : [],
  }
}

const list = (machines: Array<Machine>): MachineList => ({ asOf, windowSeconds: 1800, machines })

const north: StoredSite = { siteId: "north-plant", company: "Demo Manufacturing", name: "North plant", halls: ["Hall 1", "Hall 2"] }
const south: StoredSite = { siteId: "south-plant", company: "Demo Manufacturing", name: "South plant", halls: [] }

const placement = (machineId: string, siteId: string, hall: string | null, displayName: string | null = null): Placement => ({
  machineId,
  siteId,
  hall,
  displayName,
  placedAt: "2026-11-16T08:00:00.000Z",
})

test("the machines of a site are grouped by hall, in the order of the site, and counted by state", () => {
  const result = sitesOf(
    [north, south],
    [
      placement("M-02", "north-plant", "Hall 1", "Mill 2"),
      placement("M-01", "north-plant", "Hall 1"),
      placement("M-03", "north-plant", null),
      placement("M-04", "south-plant", null),
    ],
    list([
      machine("M-01", {}),
      machine("M-02", { itemState: "Ready" }),
      machine("M-03", { error: true }),
      machine("M-04", { operationMode: "Setup" }),
      machine("M-07", {}),
    ]),
  )

  const [first, second] = result.sites
  assert.deepEqual(
    first?.halls.map((hall) => [hall.name, hall.machines.map((one) => [one.machine, one.state])]),
    [
      ["Hall 1", [["M-01", "running"], ["M-02", "stopped"]]],
      // A hall without machines is a hall of the site all the same.
      ["Hall 2", []],
      [null, [["M-03", "alarm"]]],
    ],
  )
  assert.equal(first?.machineCount, 3)
  // In the order a display reads the states.
  assert.deepEqual(first?.counts, [
    { state: "running", machines: 1 },
    { state: "stopped", machines: 1 },
    { state: "alarm", machines: 1 },
  ])
  assert.equal(first?.halls[0]?.machines[1]?.displayName, "Mill 2")
  assert.deepEqual(second?.counts, [{ state: "setup", machines: 1 }])

  // All sites together.
  assert.equal(result.machineCount, 4)
  assert.deepEqual(result.counts, [
    { state: "running", machines: 1 },
    { state: "setup", machines: 1 },
    { state: "stopped", machines: 1 },
    { state: "alarm", machines: 1 },
  ])
  // M-07 sends values and stands on no site: the one suggestion.
  assert.deepEqual(result.unplaced, [{ machine: "M-07", state: "running", lastValueAt: secondsAgo(5) }])
  assert.equal(siteList.safeParse(result).success, true)
})

test("a machine on a site that published nothing in the last 24 hours has no data, and is no suggestion", () => {
  const result = sitesOf([south], [placement("M-09", "south-plant", null)], list([]))
  const [placed] = result.sites[0]?.halls[0]?.machines ?? []
  assert.equal(placed?.state, "no-data")
  assert.equal(placed?.now, null)
  assert.deepEqual(result.counts, [{ state: "no-data", machines: 1 }])
  assert.deepEqual(result.unplaced, [])
})

test("a machine that went silent is still a suggestion, without data", () => {
  const result = sitesOf([], [], list([machine("M-05", { silentFor: 3600 })]))
  assert.deepEqual(result.unplaced, [{ machine: "M-05", state: "no-data", lastValueAt: secondsAgo(3600) }])
  assert.equal(result.machineCount, 0)
  assert.deepEqual(result.counts, [])
})

test("a machine on a site the Sites API does not list stands on none, and is a suggestion while it sends", () => {
  const result = sitesOf([north], [placement("M-01", "gone-plant", null)], list([machine("M-01", {})]))
  assert.equal(result.machineCount, 0)
  assert.deepEqual(
    result.unplaced.map((one) => one.machine),
    ["M-01"],
  )
})

test("a hall of a placement that the site does not name is shown after the halls of the site", () => {
  const result = sitesOf([north], [placement("M-01", "north-plant", "Hall 9")], list([machine("M-01", {})]))
  assert.deepEqual(
    result.sites[0]?.halls.map((hall) => hall.name),
    ["Hall 1", "Hall 2", "Hall 9"],
  )
})

test("counts leave out a state no machine is in", () => {
  assert.deepEqual(countsOf(["no-data", "running", "no-data"]), [
    { state: "running", machines: 1 },
    { state: "no-data", machines: 2 },
  ])
  assert.deepEqual(countsOf([]), [])
})

const apis = { timeseriesUrl: "http://timeseries:8080", eventsUrl: "http://events:8080", sitesUrl: "http://sites:8080" }

/** The three APIs: the Sites API with what it holds, and a stack in which no machine published a value. */
function serve(sites: unknown, placements: unknown): Array<string> {
  const requested: Array<string> = []
  mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(String(input))
    requested.push(`${url.origin}${url.pathname}`)
    if (url.origin === apis.sitesUrl && url.pathname === "/sites") return Response.json(sites)
    if (url.origin === apis.sitesUrl && url.pathname === "/placements") return Response.json(placements)
    if (url.pathname === "/topics") return Response.json({ baseUnitTopics: [], stringTopics: [], booleanTopics: [] })
    // The Events API: no alert and no job order.
    if (url.origin === apis.eventsUrl) return Response.json({ items: [] })
    return Response.json({ series: [] })
  })
  return requested
}

test("the sites and placements are read from the Sites API, and the result keeps the contract of the card", async () => {
  const requested = serve(
    [{ siteId: "north-plant", company: "Demo Manufacturing", name: "North plant", halls: ["Hall 1"] }],
    // The Sites API writes an instant with ticks; the result writes it as every other instant.
    [{ machineId: "merope-microtec_MM-120_M-02", siteId: "north-plant", hall: "Hall 1", displayName: null, placedAt: "2026-11-16T08:00:00.1234567Z" }],
  )
  const result = await listSites(apis, new Date(asOf))
  assert.ok(requested.includes("http://sites:8080/sites"))
  assert.ok(requested.includes("http://sites:8080/placements"))
  assert.equal(result.sites[0]?.halls[0]?.machines[0]?.machine, "merope-microtec_MM-120_M-02")
  assert.equal(result.sites[0]?.halls[0]?.machines[0]?.placedAt, "2026-11-16T08:00:00.123Z")
  assert.equal(result.sites[0]?.halls[0]?.machines[0]?.state, "no-data")
  assert.equal(siteList.safeParse(result).success, true)
})

test("an answer of the Sites API in a shape this server does not know fails, and names the API", async () => {
  serve([{ siteId: "north-plant" }], [])
  await assert.rejects(listSites(apis, new Date(asOf)), /^Error: The Sites API answered in a shape this server does not know/)
})

test("a server that was not told where the Sites API is says so", async () => {
  serve([], [])
  await assert.rejects(
    listSites({ timeseriesUrl: apis.timeseriesUrl, eventsUrl: apis.eventsUrl }, new Date(asOf)),
    /SITES_API_URL/,
  )
})
