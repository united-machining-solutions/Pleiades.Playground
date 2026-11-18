import assert from "node:assert/strict"
import { test } from "node:test"

import { KEPT_PROPOSALS_KEY, MAX_KEPT_PROPOSALS, createKeptProposals } from "./kept-proposals.ts"
import type { Backing } from "./store.ts"

/** A storage in memory, as `localStorage` is one. */
function memory(held: Record<string, string> = {}): Backing & { held: Record<string, string> } {
  return {
    held,
    getItem: (key) => held[key] ?? null,
    setItem: (key, value) => {
      held[key] = value
    },
  }
}

test("a proposal that was kept finds its page by the id of its tool call", () => {
  const links = createKeptProposals(() => memory())
  const backing = memory()
  const kept = createKeptProposals(() => backing)
  assert.equal(links.keptPageOf("call_1"), undefined)
  assert.equal(kept.keepProposal("call_1", "0a1b2c3d4e5f"), true)
  assert.equal(kept.keptPageOf("call_1"), "0a1b2c3d4e5f")
  assert.equal(kept.keptPageOf("call_2"), undefined)
})

test("the link holds after a reload: it is in the storage, not in the app", () => {
  const backing = memory()
  createKeptProposals(() => backing).keepProposal("call_1", "0a1b2c3d4e5f")
  assert.equal(createKeptProposals(() => backing).keptPageOf("call_1"), "0a1b2c3d4e5f")
  assert.deepEqual(JSON.parse(backing.held[KEPT_PROPOSALS_KEY] ?? ""), [["call_1", "0a1b2c3d4e5f"]])
})

test("a proposal kept again points at the page it was kept as last", () => {
  const backing = memory()
  const kept = createKeptProposals(() => backing)
  kept.keepProposal("call_1", "aaaaaaaaaaaa")
  kept.keepProposal("call_2", "bbbbbbbbbbbb")
  kept.keepProposal("call_1", "cccccccccccc")
  assert.equal(kept.keptPageOf("call_1"), "cccccccccccc")
  assert.deepEqual(JSON.parse(backing.held[KEPT_PROPOSALS_KEY] ?? ""), [
    ["call_2", "bbbbbbbbbbbb"],
    ["call_1", "cccccccccccc"],
  ])
})

test(`at most ${MAX_KEPT_PROPOSALS} links are kept, the oldest go first`, () => {
  const backing = memory()
  const kept = createKeptProposals(() => backing)
  for (let index = 0; index <= MAX_KEPT_PROPOSALS; index++) kept.keepProposal(`call_${index}`, `page${index}`)
  assert.equal(kept.keptPageOf("call_0"), undefined)
  assert.equal(kept.keptPageOf("call_1"), "page1")
  assert.equal(kept.keptPageOf(`call_${MAX_KEPT_PROPOSALS}`), `page${MAX_KEPT_PROPOSALS}`)
})

test("what the storage holds otherwise is no link, and the links that are one stay", () => {
  for (const raw of ["not JSON", "null", "{}", '{"call_1":"0a1b2c3d4e5f"}', "[1,2]"]) {
    assert.equal(createKeptProposals(() => memory({ [KEPT_PROPOSALS_KEY]: raw })).keptPageOf("call_1"), undefined, raw)
  }
  const mixed = JSON.stringify([["call_1", "../pages"], ["call_2"], [3, "0a1b2c3d4e5f"], ["call_3", "0a1b2c3d4e5f"]])
  const kept = createKeptProposals(() => memory({ [KEPT_PROPOSALS_KEY]: mixed }))
  assert.equal(kept.keptPageOf("call_1"), undefined)
  assert.equal(kept.keptPageOf("call_3"), "0a1b2c3d4e5f")
})

test("a page id that is no id of a stored page is not noted", () => {
  const backing = memory()
  const kept = createKeptProposals(() => backing)
  assert.equal(kept.keepProposal("call_1", "../pages/open"), false)
  assert.equal(kept.keepProposal("x".repeat(201), "0a1b2c3d4e5f"), false)
  assert.equal(backing.held[KEPT_PROPOSALS_KEY], undefined)
})

test("a browser that blocks its storage, or has none, keeps no link and does not break", () => {
  const blocked = createKeptProposals(() => ({
    getItem: () => {
      throw new Error("blocked")
    },
    setItem: () => {
      throw new Error("blocked")
    },
  }))
  assert.equal(blocked.keepProposal("call_1", "0a1b2c3d4e5f"), false)
  assert.equal(blocked.keptPageOf("call_1"), undefined)
  const none = createKeptProposals(() => undefined)
  assert.equal(none.keepProposal("call_1", "0a1b2c3d4e5f"), false)
  assert.equal(none.keptPageOf("call_1"), undefined)
})
