import assert from "node:assert/strict"
import { test } from "node:test"

import { makeHallAlone, makeSiteAlone, placeAdded, placedInWords, place, remove, sitesOf, undo, unmake } from "./placements.ts"
import type { Send } from "./placements.ts"
import type { PlaceRequest } from "./placing.ts"

const P07 = "taygeta-precision_TP-800_P-07"
const M02 = "merope-microtec_MM-120_M-02"

type Site = { siteId: string; company: string; name: string; halls: Array<string> }
type Placement = { machineId: string; siteId: string; hall: string | null; displayName: string | null }

/** The entity tag of a site, as the Sites API makes it from what can change of a site. */
const etagOf = (site: Site) => `"${JSON.stringify([site.company, site.name, site.halls])}"`

/** A Sites API in memory, by the rules of its README: what the steps send, and what it answers. */
function sitesApi(sites: Array<Site> = [], placements: Array<Placement> = []) {
  const calls: Array<string> = []
  const json = (status: number, value: unknown) => ({ status, text: JSON.stringify(value) })
  const listed = () => sites.map((site) => ({ ...site, etag: etagOf(site) }))
  const send: Send = async (path, method, body, conditions) => {
    calls.push(`${method} ${path}${conditions?.ifMatch ? " if-match" : ""}${conditions?.ifNoneMatch ? " if-none-match" : ""}`)
    const [, kind, raw] = path.split("/")
    const id = raw === undefined ? undefined : decodeURIComponent(raw)
    if (kind === "sites" && method === "GET") return json(200, listed())
    if (kind === "placements" && method === "GET") return json(200, placements)
    if (kind === "sites" && (method === "PUT" || method === "DELETE")) {
      const there = sites.find((one) => one.siteId === id)
      if (conditions?.ifNoneMatch === "*" && there) return json(412, `The site '${id}' exists already.`)
      if (conditions?.ifMatch && (!there || etagOf(there) !== conditions.ifMatch)) return json(412, `The site '${id}' was changed since it was read.`)
    }
    if (kind === "sites" && method === "PUT") {
      const given = body as Omit<Site, "siteId">
      const existing = sites.findIndex((one) => one.siteId === id)
      const leftOut = existing < 0 ? [] : sites[existing]!.halls.filter((hall) => !given.halls.includes(hall))
      if (placements.some((one) => one.siteId === id && one.hall !== null && leftOut.includes(one.hall))) {
        return json(409, "A hall left out still has machines.")
      }
      const site = { siteId: id!, ...given }
      if (existing >= 0) sites[existing] = site
      else sites.push(site)
      return json(existing >= 0 ? 200 : 201, { ...site, etag: etagOf(site) })
    }
    if (kind === "sites" && method === "DELETE") {
      const existing = sites.findIndex((one) => one.siteId === id)
      if (existing < 0) return { status: 404, text: "" }
      if (placements.some((one) => one.siteId === id)) return json(409, "Machines stand on it.")
      sites.splice(existing, 1)
      return { status: 204, text: "" }
    }
    if (kind === "placements" && method === "PUT") {
      const given = body as Omit<Placement, "machineId">
      const site = sites.find((one) => one.siteId === given.siteId)
      if (!site) return json(400, `There is no site '${given.siteId}'. Create it with PUT /sites/${given.siteId} first.`)
      if (given.hall !== null && !site.halls.includes(given.hall)) return json(400, `The site '${site.siteId}' has no hall '${given.hall}'.`)
      const existing = placements.findIndex((one) => one.machineId === id)
      const placement = { machineId: id!, siteId: given.siteId, hall: given.hall, displayName: given.displayName }
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
const south = (): Site => ({ siteId: "south-plant", company: "Demo Manufacturing", name: "South plant", halls: ["Hall A"] })

function request(more: Partial<PlaceRequest>): PlaceRequest {
  return { machine: P07, site: { siteId: "north-plant" }, hall: null, newHall: false, displayName: null, from: null, ...more }
}

test("a machine on no site is added in a hall of a site, with the name people know it by", async () => {
  const api = sitesApi([north()])
  const outcome = await place(request({ hall: "Hall 2", displayName: "Grinder 7" }), api.send)
  assert.deepEqual(outcome, { ok: true, siteId: "north-plant", siteName: "North plant", hall: "Hall 2", before: null, made: {} })
  assert.deepEqual(api.placements, [{ machineId: P07, siteId: "north-plant", hall: "Hall 2", displayName: "Grinder 7" }])
})

test("a new site is made first, with its new hall, under an id that is not taken, and an undo knows it", async () => {
  const api = sitesApi([{ ...north(), siteId: "east-plant", name: "East" }])
  const outcome = await place(request({ site: { name: "East plant", company: "Demo Manufacturing" }, hall: "Hall A", newHall: true }), api.send)
  const site = { siteId: "east-plant-2", company: "Demo Manufacturing", name: "East plant", halls: ["Hall A"] }
  assert.deepEqual(outcome, {
    ok: true,
    siteId: "east-plant-2",
    siteName: "East plant",
    hall: "Hall A",
    before: null,
    made: { siteId: "east-plant-2", siteEtag: etagOf(site) },
  })
  assert.deepEqual(api.sites[1], site)
  // Made only where there is none: If-None-Match.
  assert.ok(api.calls.includes("PUT /sites/east-plant-2 if-none-match"))
})

test("a site someone made under the same id between the read and the write is not written over", async () => {
  const api = sitesApi()
  const theOther = { siteId: "west-plant", company: "Other", name: "West plant", halls: ["Hall X"] }
  const racing: Send = (path, method, body, conditions) => {
    if (path === "/sites/west-plant" && method === "PUT" && !api.sites.some((site) => site.siteId === "west-plant")) api.sites.push(theOther)
    return api.send(path, method, body, conditions)
  }
  const outcome = await place(request({ site: { name: "West plant", company: "Demo" } }), racing)
  assert.deepEqual(outcome, { ok: false, reason: "Someone made a site under the same name meanwhile: choose it from the list.", stale: true })
  assert.deepEqual(api.sites, [theOther])
  assert.deepEqual(api.placements, [])
})

test("a hall added to a site someone changed between the read and the write writes nothing over", async () => {
  const api = sitesApi([north()])
  const racing: Send = (path, method, body, conditions) => {
    if (path === "/sites/north-plant" && method === "PUT" && api.sites[0]!.name === "North plant") {
      api.sites[0] = { ...api.sites[0]!, name: "North plant, renamed", halls: ["Hall 1", "Hall 2", "Hall 9"] }
    }
    return api.send(path, method, body, conditions)
  }
  const outcome = await place(request({ hall: "Hall 3", newHall: true }), racing)
  assert.deepEqual(outcome, { ok: false, reason: "Someone changed the site meanwhile.", stale: true })
  assert.deepEqual(api.sites[0], { ...north(), name: "North plant, renamed", halls: ["Hall 1", "Hall 2", "Hall 9"] })
  assert.deepEqual(api.placements, [])
})

test("a new hall is added to the halls the site has now, and an undo knows it", async () => {
  const api = sitesApi([north()])
  const outcome = await place(request({ hall: "Hall 3", newHall: true }), api.send)
  assert.equal(outcome.ok && outcome.made.hall?.hall, "Hall 3")
  assert.deepEqual(api.sites[0]!.halls, ["Hall 1", "Hall 2", "Hall 3"])
})

test("a new hall that someone made meanwhile is taken as it is, and is not the change's to undo", async () => {
  const api = sitesApi([north()])
  const outcome = await place(request({ hall: "Hall 2", newHall: true }), api.send)
  assert.ok(!api.calls.includes("PUT /sites/north-plant"))
  assert.deepEqual(outcome.ok && outcome.made, {})
})

test("a hall with a blank at its end is taken as the Sites API keeps it", async () => {
  const api = sitesApi([{ ...north(), halls: [" Hall 1 "] }])
  const outcome = await place(request({ hall: " Hall 1 " }), api.send)
  assert.equal(outcome.ok, true)
  assert.equal(api.placements[0]!.hall, " Hall 1 ")
})

test("a machine is moved from where Home showed it, and the undo learns where it stood from the Sites API", async () => {
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" }])
  const outcome = await place(request({ hall: "Hall 2", displayName: "Grinder 7", from: { siteId: "north-plant", hall: "Hall 1" } }), api.send)
  assert.deepEqual(outcome.ok && outcome.before, { siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" })
  assert.deepEqual(api.placements, [{ machineId: P07, siteId: "north-plant", hall: "Hall 2", displayName: "Grinder 7" }])
})

test("a move is refused where someone moved the machine or took it off meanwhile", async () => {
  const api = sitesApi([north(), south()], [{ machineId: P07, siteId: "south-plant", hall: "Hall A", displayName: null }])
  const moved = await place(request({ hall: "Hall 2", from: { siteId: "north-plant", hall: "Hall 1" } }), api.send)
  assert.deepEqual(moved, { ok: false, reason: "It stands on South plant, Hall A now: someone changed it meanwhile.", stale: true })
  assert.equal(api.placements[0]!.siteId, "south-plant")
  const gone = await place(request({ hall: "Hall 2", from: { siteId: "north-plant", hall: "Hall 1" } }), sitesApi([north()]).send)
  assert.deepEqual(gone, { ok: false, reason: "It was taken off its site meanwhile.", stale: true })
})

test("twice: a machine someone placed meanwhile is not moved, and the list is read again", async () => {
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: null }])
  const outcome = await place(request({ hall: "Hall 2" }), api.send)
  assert.deepEqual(outcome, { ok: false, reason: "It already stands on North plant, Hall 1: someone placed it meanwhile.", stale: true })
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
  assert.deepEqual(outcome, { ok: false, reason: "The Sites API answered 500. The new site was made and stays.", stale: true })
})

test("the Sites API away or too slow: every step says so in words, and nothing is out of date", async () => {
  const away: Send = () => Promise.reject(new TypeError("fetch failed", { cause: Object.assign(new Error("connect"), { code: "ECONNREFUSED" }) }))
  assert.deepEqual(await place(request({}), away), { ok: false, reason: "The Sites API did not answer: ECONNREFUSED.", stale: false })
  const from = { siteId: "north-plant", hall: null }
  assert.deepEqual(await remove({ machine: P07, from }, away), { ok: false, reason: "The Sites API did not answer: ECONNREFUSED.", stale: false })
  // What fetch throws when AbortSignal.timeout ends it: a DOMException whose code is 23.
  const slow: Send = () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
  assert.deepEqual(await place(request({}), slow), { ok: false, reason: "The Sites API did not answer: no answer in time.", stale: false })
  assert.deepEqual(await undo({ machine: P07, now: null, back: null, made: {} }, slow), {
    ok: false,
    reason: "The Sites API did not answer: no answer in time.",
  })
})

test("writing refused for want of a role is said in words", async () => {
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: null, displayName: null }])
  const forbidden: Send = (path, method, body) => (method === "GET" ? api.send(path, method, body) : Promise.resolve({ status: 403, text: "" }))
  const outcome = await place(request({ machine: M02 }), forbidden)
  assert.match(outcome.ok ? "" : outcome.reason, /sites:write/)
  const removed = await remove({ machine: P07, from: { siteId: "north-plant", hall: null } }, forbidden)
  assert.match(removed.ok ? "" : removed.reason, /sites:write/)
})

test("a machine is taken off its site; where it stood comes from the Sites API, not from the page", async () => {
  // Home still shows no name; someone gave it one since.
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" }])
  const outcome = await remove({ machine: P07, from: { siteId: "north-plant", hall: "Hall 1" } }, api.send)
  assert.deepEqual(outcome, {
    ok: true,
    already: false,
    before: { siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" },
    siteName: "North plant",
  })
  assert.deepEqual(api.placements, [])
  assert.deepEqual(await remove({ machine: P07, from: { siteId: "north-plant", hall: "Hall 1" } }, api.send), { ok: true, already: true })
})

test("a removal is refused where someone moved the machine meanwhile", async () => {
  const api = sitesApi([north(), south()], [{ machineId: P07, siteId: "south-plant", hall: "Hall A", displayName: null }])
  const outcome = await remove({ machine: P07, from: { siteId: "north-plant", hall: "Hall 1" } }, api.send)
  assert.deepEqual(outcome, { ok: false, reason: "It stands on South plant, Hall A now: someone changed it meanwhile.", stale: true })
  assert.equal(api.placements.length, 1)
})

test("undo of a removal puts the machine back where it stood, with its name", async () => {
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" }])
  const removed = await remove({ machine: P07, from: { siteId: "north-plant", hall: "Hall 1" } }, api.send)
  assert.ok(removed.ok && !removed.already)
  const outcome = await undo({ machine: P07, now: null, back: removed.before, made: {} }, api.send)
  assert.deepEqual(outcome, { ok: true })
  assert.deepEqual(api.placements, [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: "Grinder 7" }])
})

test("undo of a removal leaves a machine alone that someone placed elsewhere meanwhile", async () => {
  const api = sitesApi([north(), south()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: null }])
  const removed = await remove({ machine: P07, from: { siteId: "north-plant", hall: "Hall 1" } }, api.send)
  assert.ok(removed.ok && !removed.already)
  await api.send(`/placements/${P07}`, "PUT", { siteId: "south-plant", hall: "Hall A", displayName: null })
  const outcome = await undo({ machine: P07, now: null, back: removed.before, made: {} }, api.send)
  assert.deepEqual(outcome, { ok: false, reason: "It was changed again meanwhile, so it stays where it is now." })
  assert.deepEqual(api.placements, [{ machineId: P07, siteId: "south-plant", hall: "Hall A", displayName: null }])
})

test("undo of a move puts it back, unless it was moved again", async () => {
  const api = sitesApi([north()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 1", displayName: null }])
  const moved = await place(request({ hall: "Hall 2", from: { siteId: "north-plant", hall: "Hall 1" } }), api.send)
  assert.ok(moved.ok)
  const now = { siteId: moved.siteId, hall: moved.hall }
  assert.deepEqual(await undo({ machine: P07, now, back: moved.before, made: moved.made }, api.send), { ok: true })
  assert.equal(api.placements[0]!.hall, "Hall 1")
  // A second undo of the same move finds the machine elsewhere already.
  assert.equal((await undo({ machine: P07, now, back: moved.before, made: moved.made }, api.send)).ok, false)
})

test("undo of adding takes the machine off, and the site or hall it made goes too", async () => {
  const api = sitesApi([north()])
  const onNewSite = await place(request({ site: { name: "West plant", company: "Demo" }, hall: "Hall W", newHall: true }), api.send)
  assert.ok(onNewSite.ok)
  const now = { siteId: onNewSite.siteId, hall: "Hall W" }
  assert.deepEqual(await undo({ machine: P07, now, back: null, made: onNewSite.made }, api.send), { ok: true })
  assert.deepEqual(
    api.sites.map((site) => site.siteId),
    ["north-plant"],
  )
  assert.deepEqual(api.placements, [])

  const inNewHall = await place(request({ hall: "Hall 3", newHall: true }), api.send)
  assert.ok(inNewHall.ok)
  await undo({ machine: P07, now: { siteId: "north-plant", hall: "Hall 3" }, back: null, made: inNewHall.made }, api.send)
  assert.deepEqual(api.sites[0]!.halls, ["Hall 1", "Hall 2"])
})

test("a site the change made stays where someone changed it meanwhile, and so does a hall", async () => {
  const api = sitesApi([north()])
  const onNewSite = await place(request({ site: { name: "West plant", company: "Demo" } }), api.send)
  assert.ok(onNewSite.ok)
  api.sites[1] = { ...api.sites[1]!, name: "West plant, renamed" }
  await undo({ machine: P07, now: { siteId: "west-plant", hall: null }, back: null, made: onNewSite.made }, api.send)
  assert.deepEqual(
    api.sites.map((site) => site.name),
    ["North plant", "West plant, renamed"],
  )
  assert.ok(api.calls.includes("DELETE /sites/west-plant if-match"))
})

test("a site or hall the change made stays where someone put a machine on it meanwhile", async () => {
  const api = sitesApi([north()])
  const added = await place(request({ hall: "Hall 3", newHall: true }), api.send)
  assert.ok(added.ok)
  await api.send(`/placements/${M02}`, "PUT", { siteId: "north-plant", hall: "Hall 3", displayName: null })
  const outcome = await undo({ machine: P07, now: { siteId: "north-plant", hall: "Hall 3" }, back: null, made: added.made }, api.send)
  assert.deepEqual(outcome, { ok: true })
  assert.deepEqual(api.sites[0]!.halls, ["Hall 1", "Hall 2", "Hall 3"])
  assert.deepEqual(
    api.placements.map((one) => one.machineId),
    [M02],
  )
})

test("a machine id with characters of a path is sent encoded", async () => {
  const api = sitesApi([north()])
  await place(request({ machine: "a b?c" }), api.send)
  assert.ok(api.calls.includes("PUT /placements/a%20b%3Fc"))
})

test("the sites to choose from are by name, without what a person does not choose by", async () => {
  const api = sitesApi([south(), north()])
  assert.deepEqual(await sitesOf(api.send), {
    ok: true,
    sites: [
      { siteId: "north-plant", name: "North plant" },
      { siteId: "south-plant", name: "South plant" },
    ],
  })
})

test("sites that cannot be read are a reason, not an error", async () => {
  const refused = await sitesOf(async () => ({ status: 403, text: "" }))
  assert.deepEqual(refused, { ok: false, reason: "The Sites API refused the change: writing needs the role sites:write." })
  const silent = await sitesOf(async () => {
    throw new Error("connect ECONNREFUSED")
  })
  assert.equal(silent.ok, false)
  assert.match(!silent.ok ? silent.reason : "", /did not answer: connect ECONNREFUSED/)
})

test("an added machine goes on the site, in no hall and under no name", async () => {
  const api = sitesApi([north(), south()])
  const outcome = await placeAdded({ machine: P07, siteId: "south-plant" }, api.send)
  assert.deepEqual(outcome, { ok: true, siteId: "south-plant", siteName: "South plant", already: false })
  assert.deepEqual(api.placements, [{ machineId: P07, siteId: "south-plant", hall: null, displayName: null }])
})

test("an added machine that stands on a site already stays there", async () => {
  const api = sitesApi([north(), south()], [{ machineId: P07, siteId: "north-plant", hall: "Hall 2", displayName: "Laser 7" }])
  const outcome = await placeAdded({ machine: P07, siteId: "south-plant" }, api.send)
  assert.deepEqual(outcome, { ok: true, siteId: "north-plant", siteName: "North plant", already: true })
  assert.deepEqual(api.placements, [{ machineId: P07, siteId: "north-plant", hall: "Hall 2", displayName: "Laser 7" }])
  assert.ok(!api.calls.some((call) => call.startsWith("PUT")))
})

test("an added machine on a site that is gone says so", async () => {
  const api = sitesApi([north()])
  const outcome = await placeAdded({ machine: P07, siteId: "south-plant" }, api.send)
  assert.deepEqual(outcome, { ok: false, reason: "The site 'south-plant' is no longer there." })
  assert.deepEqual(api.placements, [])
})

test("the words of the toast", () => {
  assert.equal(placedInWords("P-07", "North plant", "Hall 2", false), "P-07 added · North plant, Hall 2")
  assert.equal(placedInWords("P-07", "North plant", null, true), "P-07 moved · North plant")
})

test("a site is made alone, with its first hall, under an id that is not taken, and only where none is there", async () => {
  const api = sitesApi([north()])
  const outcome = await makeSiteAlone({ name: "North plant", company: "Demo Manufacturing", hall: "Hall 1" }, api.send)
  assert.ok(outcome.ok)
  assert.equal(outcome.siteId, "north-plant-2")
  assert.deepEqual(outcome.made, { siteId: "north-plant-2", siteEtag: etagOf(api.sites[1]!) })
  assert.deepEqual(api.sites[1], { siteId: "north-plant-2", company: "Demo Manufacturing", name: "North plant", halls: ["Hall 1"] })
  assert.deepEqual(api.calls, ["GET /sites", "PUT /sites/north-plant-2 if-none-match"])
})

test("a site someone made under the same id meanwhile is not written over, with a sentence", async () => {
  const api = sitesApi()
  const send: Send = async (path, method, body, conditions) => {
    // Someone makes the site between the read and the write.
    if (method === "PUT") api.sites.push({ siteId: "west-plant", company: "Other", name: "West plant", halls: [] })
    return api.send(path, method, body, conditions)
  }
  const outcome = await makeSiteAlone({ name: "West plant", company: "Demo Manufacturing", hall: null }, send)
  assert.deepEqual(outcome, { ok: false, reason: "Someone made a site under the same name meanwhile: choose it from the list.", stale: true })
  assert.equal(api.sites[0]!.company, "Other")
})

test("a hall is added alone onto the site as it was read; one that is there makes nothing; a changed site refuses", async () => {
  const api = sitesApi([north()])
  const outcome = await makeHallAlone({ siteId: "north-plant", hall: "Hall 4" }, api.send)
  assert.deepEqual(outcome, { ok: true, siteId: "north-plant", siteName: "North plant", hall: "Hall 4", made: { hall: { siteId: "north-plant", hall: "Hall 4" } } })
  assert.deepEqual(api.sites[0]!.halls, ["Hall 1", "Hall 2", "Hall 4"])
  assert.deepEqual(api.calls, ["GET /sites", "PUT /sites/north-plant if-match"])

  assert.deepEqual(await makeHallAlone({ siteId: "north-plant", hall: "Hall 4" }, api.send), {
    ok: true,
    siteId: "north-plant",
    siteName: "North plant",
    hall: "Hall 4",
    made: {},
  })
  assert.deepEqual(await makeHallAlone({ siteId: "gone", hall: "Hall 1" }, api.send), {
    ok: false,
    reason: "The site 'gone' is no longer there.",
    stale: true,
  })
  const changing = sitesApi([north()])
  const send: Send = async (path, method, body, conditions) => {
    if (method === "PUT") changing.sites[0]!.name = "North plant (old)"
    return changing.send(path, method, body, conditions)
  }
  assert.deepEqual(await makeHallAlone({ siteId: "north-plant", hall: "Hall 5" }, send), {
    ok: false,
    reason: "Someone changed the site meanwhile.",
    stale: true,
  })
})

test("a site or hall made alone goes again on undo, and stays with a sentence where something stands on it", async () => {
  const api = sitesApi([north()])
  const site = await makeSiteAlone({ name: "West plant", company: "Demo Manufacturing", hall: null }, api.send)
  const hall = await makeHallAlone({ siteId: "north-plant", hall: "Hall 4" }, api.send)
  assert.ok(site.ok && hall.ok)
  assert.deepEqual(await unmake(site.made, api.send), { ok: true })
  assert.deepEqual(await unmake(hall.made, api.send), { ok: true })
  assert.deepEqual(
    api.sites.map((one) => [one.siteId, one.halls]),
    [["north-plant", ["Hall 1", "Hall 2"]]],
  )

  const busy = sitesApi([north()])
  const again = await makeSiteAlone({ name: "West plant", company: "Demo Manufacturing", hall: "Hall 1" }, busy.send)
  const more = await makeHallAlone({ siteId: "north-plant", hall: "Hall 4" }, busy.send)
  assert.ok(again.ok && more.ok)
  busy.placements.push({ machineId: P07, siteId: "west-plant", hall: "Hall 1", displayName: null })
  busy.placements.push({ machineId: M02, siteId: "north-plant", hall: "Hall 4", displayName: null })
  assert.deepEqual(await unmake(again.made, busy.send), { ok: false, reason: "A machine stands on the site now, so it stays." })
  assert.deepEqual(await unmake(more.made, busy.send), { ok: false, reason: "A machine stands in Hall 4 now, so it stays." })
})

test("a site made alone that someone changed since stays on undo", async () => {
  const api = sitesApi()
  const site = await makeSiteAlone({ name: "West plant", company: "Demo Manufacturing", hall: null }, api.send)
  assert.ok(site.ok)
  api.sites[0]!.halls.push("Hall 9")
  assert.deepEqual(await unmake(site.made, api.send), { ok: false, reason: "Someone changed the site since it was made, so it stays." })
})

test("making a site or hall while the Sites API is away says so", async () => {
  const away: Send = async () => {
    throw new Error("connect ECONNREFUSED")
  }
  const site = await makeSiteAlone({ name: "West plant", company: "Demo Manufacturing", hall: null }, away)
  assert.equal(site.ok, false)
  assert.match(site.ok ? "" : site.reason, /^The Sites API did not answer/)
  const undone = await unmake({ siteId: "west-plant" }, away)
  assert.match(undone.ok ? "" : undone.reason, /^The Sites API did not answer/)
})
