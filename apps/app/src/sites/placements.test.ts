import assert from "node:assert/strict"
import { test } from "node:test"

import { placedInWords, place, remove } from "./placements.ts"
import type { Send } from "./placements.ts"
import type { PlaceRequest } from "./placing.ts"

const P07 = "taygeta-precision_TP-800_P-07"

type Site = { siteId: string; company: string; name: string; halls: Array<string> }
type Placement = { machineId: string; siteId: string; hall: string | null; displayName: string | null }

/** A Sites API in memory, by the rules of its README: what the steps send, and what it answers. */
function sitesApi(sites: Array<Site> = [], placements: Array<Placement> = []) {
  const calls: Array<string> = []
  const json = (status: number, value: unknown) => ({ status, text: JSON.stringify(value) })
  const send: Send = async (path, method, body) => {
    calls.push(`${method} ${path}`)
    const [, kind, raw] = path.split("/")
    const id = raw === undefined ? undefined : decodeURIComponent(raw)
    if (kind === "sites" && method === "GET") return json(200, sites)
    if (kind === "placements" && method === "GET") return json(200, placements)
    if (kind === "sites" && method === "PUT") {
      const given = body as Omit<Site, "siteId">
      const existing = sites.findIndex((one) => one.siteId === id)
      const site = { siteId: id!, ...given }
      if (existing >= 0) sites[existing] = site
      else sites.push(site)
      return json(existing >= 0 ? 200 : 201, site)
    }
    if (kind === "placements" && method === "PUT") {
      const given = body as Omit<Placement, "machineId">
      const site = sites.find((one) => one.siteId === given.siteId)
      if (!site) return json(400, `There is no site '${given.siteId}'. Create it with PUT /sites/${given.siteId} first.`)
      if (given.hall !== null && !site.halls.includes(given.hall)) return json(400, `The site '${site.siteId}' has no hall '${given.hall}'.`)
      const existing = placements.findIndex((one) => one.machineId === id)
      const placement = { machineId: id!, ...given }
      if (existing >= 0) placements[existing] = placement
      else placements.push(placement)
      return json(existing >= 0 ? 200 : 201, placement)
    }
    if (kind === "placements" && method === "DELETE") {
      const existing = placements.findIndex((one) => one.machineId === id)
      if (existing < 0) return { status: 404, text: "" }
      placements.splice(existing, 1)
      return { status: 204, text: "" }
    }
    throw new Error(`unexpected ${method} ${path}`)
  }
  return { sites, placements, calls, send }
}

const north = (): Site => ({ siteId: "north-plant", company: "Demo Manufacturing", name: "North plant", halls: ["Hall 1", "Hall 2"] })

function request(more: Partial<PlaceRequest>): PlaceRequest {
  return { machine: P07, site: { siteId: "north-plant" }, hall: null, newHall: false, displayName: null, move: false, ...more }
}

test("a machine on no site is placed in a hall of a site, with the name people know it by", async () => {
  const api = sitesApi([north()])
  const outcome = await place(request({ hall: "Hall 2", displayName: "Grinder 7" }), api.send)
  assert.deepEqual(outcome, { ok: true, siteName: "North plant", hall: "Hall 2" })
  assert.deepEqual(api.placements, [{ machineId: P07, siteId: "north-plant", hall: "Hall 2", displayName: "Grinder 7" }])
  assert.deepEqual(api.calls, ["GET /sites", "GET /placements", `PUT /placements/${P07}`])
})

test("a new site is made first, with its new hall, under an id that is not taken", async () => {
  const api = sitesApi([{ ...north(), siteId: "east-plant", name: "East" }])
  const outcome = await place(request({ site: { name: "East plant", company: "Demo Manufacturing" }, hall: "Hall A", newHall: true }), api.send)
  assert.deepEqual(outcome, { ok: true, siteName: "East plant", hall: "Hall A" })
  assert.deepEqual(api.sites[1], { siteId: "east-plant-2", company: "Demo Manufacturing", name: "East plant", halls: ["Hall A"] })
  assert.equal(api.placements[0]!.siteId, "east-plant-2")
})

test("a new site without a hall has none", async () => {
  const api = sitesApi()
  const outcome = await place(request({ site: { name: "West plant", company: "Demo" } }), api.send)
  assert.equal(outcome.ok, true)
  assert.deepEqual(api.sites[0]!.halls, [])
  assert.equal(api.placements[0]!.hall, null)
})

test("a new hall is added to the halls the site has now, and keeps the others", async () => {
  const api = sitesApi([north()])
  const outcome = await place(request({ hall: "Hall 3", newHall: true }), api.send)
  assert.equal(outcome.ok, true)
  assert.deepEqual(api.sites[0]!.halls, ["Hall 1", "Hall 2", "Hall 3"])
  assert.equal(api.placements[0]!.hall, "Hall 3")
})

test("a new hall that someone made meanwhile is taken as it is, without writing the site", async () => {
  const api = sitesApi([north()])
  await place(request({ hall: "Hall 2", newHall: true }), api.send)
  assert.ok(!api.calls.includes("PUT /sites/north-plant"))
  assert.deepEqual(api.sites[0]!.halls, ["Hall 1", "Hall 2"])
})

test("a machine is moved to another hall and keeps what was said of it", async () => {
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" }])
  const outcome = await place(request({ hall: "Hall 2", displayName: "Grinder 7", move: true }), api.send)
  assert.deepEqual(outcome, { ok: true, siteName: "North plant", hall: "Hall 2" })
  assert.deepEqual(api.placements, [{ machineId: P07, siteId: "north-plant", hall: "Hall 2", displayName: "Grinder 7" }])
  assert.ok(!api.calls.includes("GET /placements"))
})

test("twice: a machine someone placed meanwhile is not moved, and the list is read again", async () => {
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: null }])
  const outcome = await place(request({ hall: "Hall 2" }), api.send)
  assert.deepEqual(outcome, { ok: false, reason: "It already stands on North plant: someone placed it meanwhile.", stale: true })
  assert.equal(api.placements[0]!.hall, "Hall 1")
})

test("conflict: a site removed meanwhile is named, and nothing is written", async () => {
  const api = sitesApi([])
  const outcome = await place(request({ hall: "Hall 2" }), api.send)
  assert.deepEqual(outcome, { ok: false, reason: "The site 'north-plant' is no longer there.", stale: true })
  assert.deepEqual(api.placements, [])
})

test("conflict: a hall dropped meanwhile is refused with the sentence of the API", async () => {
  const api = sitesApi([{ ...north(), halls: ["Hall 1"] }])
  const outcome = await place(request({ hall: "Hall 2" }), api.send)
  assert.deepEqual(outcome, { ok: false, reason: "The site 'north-plant' has no hall 'Hall 2'.", stale: true })
})

test("a new site that is made while the placement fails stays, and the person reads so", async () => {
  const api = sitesApi()
  const failing: Send = (path, method, body) =>
    path.startsWith("/placements/") && method === "PUT" ? Promise.resolve({ status: 500, text: "" }) : api.send(path, method, body)
  const outcome = await place(request({ site: { name: "West plant", company: "Demo" } }), failing)
  assert.deepEqual(outcome, { ok: false, reason: "The Sites API answered 500. The site West plant was made and stays.", stale: true })
})

test("the Sites API away: placing and removing say so, and nothing is out of date", async () => {
  const away: Send = () => Promise.reject(new TypeError("fetch failed", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) }))
  assert.deepEqual(await place(request({}), away), { ok: false, reason: "The Sites API did not answer: ECONNREFUSED.", stale: false })
  assert.deepEqual(await remove(P07, away), { ok: false, reason: "The Sites API did not answer: ECONNREFUSED." })
})

test("writing refused for want of a role is said in words", async () => {
  const api = sitesApi([north()])
  const forbidden: Send = (path, method, body) => (method === "GET" ? api.send(path, method, body) : Promise.resolve({ status: 403, text: "" }))
  const outcome = await place(request({}), forbidden)
  assert.equal(outcome.ok, false)
  assert.match(outcome.ok ? "" : outcome.reason, /sites:write/)
  const removed = await remove(P07, forbidden)
  assert.match(removed.ok ? "" : removed.reason, /sites:write/)
})

test("a machine is taken off its site; one that stood on none is off it already", async () => {
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: null }])
  assert.deepEqual(await remove(P07, api.send), { ok: true, already: false })
  assert.deepEqual(api.placements, [])
  assert.deepEqual(await remove(P07, api.send), { ok: true, already: true })
})

test("undo of a removal puts the machine back where it stood, with its name", async () => {
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" }])
  await remove(P07, api.send)
  const outcome = await place(request({ hall: "Hall 1", displayName: "Grinder 7" }), api.send)
  assert.equal(outcome.ok, true)
  assert.deepEqual(api.placements, [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" }])
})

test("a machine id with characters of a path is sent encoded", async () => {
  const api = sitesApi([north()])
  await place(request({ machine: "a b?c" }), api.send)
  assert.ok(api.calls.includes("PUT /placements/a%20b%3Fc"))
})

test("the words of the toast", () => {
  assert.equal(placedInWords("P-07", "North plant", "Hall 2", false), "P-07 added · North plant, Hall 2")
  assert.equal(placedInWords("P-07", "North plant", null, true), "P-07 moved · North plant")
})
