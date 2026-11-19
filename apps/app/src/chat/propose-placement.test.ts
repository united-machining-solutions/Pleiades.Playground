import assert from "node:assert/strict"
import { test } from "node:test"

import type { SiteList } from "@pleiades/cards/site/contract.ts"
import { z } from "zod"

import { PROPOSE_PLACEMENT_TOOL } from "../placement/proposal.ts"
import { proposePlacement, proposePlacementTool } from "./propose-placement.ts"

const list: SiteList = {
  asOf: "2026-11-19T10:00:00.000Z",
  windowSeconds: 1800,
  source: "Sites API /sites and /placements",
  machineCount: 0,
  counts: [],
  sending: 0,
  needsYou: 0,
  sites: [{ siteId: "north-plant", company: "Demo Manufacturing", name: "North plant", machineCount: 0, counts: [], halls: [{ name: "Hall 1", machines: [] }] }],
  unplaced: [],
  sitesError: null,
}
const read = () => Promise.resolve(list)

test("the tool is named as the tools of the stack are, <area>_<subject>_<action>", () => {
  const tool = proposePlacementTool(read)
  assert.equal(tool.name, PROPOSE_PLACEMENT_TOOL)
  assert.match(tool.name, /^[a-z]+_[a-z]+_[a-z]+$/)
})

test("its schema asks for the machines, the site and the hall, and says the model writes nothing", () => {
  const tool = proposePlacementTool(read)
  const schema = JSON.stringify(z.toJSONSchema(tool.inputSchema))
  for (const name of ["machines", "site", "hall", "displayName", "company"]) assert.ok(schema.includes(`"${name}"`), name)
  assert.match(tool.description, /Do not ask in words first/)
})

test("a proposal comes back with what the model sent, the check and the words to pass on", async () => {
  const result = await proposePlacement({ site: "North plant", hall: "Hall 4" }, read)
  assert.deepEqual(result.input, { site: "North plant", hall: "Hall 4" })
  assert.equal(result.check.hall?.kind, "new")
  assert.match(result.summary, /add the hall Hall 4 to North plant/)
})

test("a machine without a site is a proposal: the card leaves the place to the person", async () => {
  const result = await proposePlacement({ machines: ["MFP 7"] }, read)
  assert.equal(result.check.site, null)
  assert.match(result.summary, /no place chosen/)
})

test("without a site, without the sites, or with nothing to change, the model reads why", async () => {
  await assert.rejects(proposePlacement({ site: " " }, read), /names machines, a site, or both/)
  await assert.rejects(
    proposePlacement({ site: "North plant" }, () => Promise.resolve({ ...list, sitesError: "The Sites API did not answer." })),
    /cannot be read now/,
  )
  await assert.rejects(proposePlacement({ site: "North plant", hall: "Hall 1" }, read), /Nothing to change/)
})
