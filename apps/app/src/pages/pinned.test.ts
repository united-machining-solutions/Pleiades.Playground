import assert from "node:assert/strict"
import { test } from "node:test"

import { pinnedEntries } from "./pinned.ts"
import type { StoredPage } from "./recipe.ts"

const page = (id: string, title: string, pinned: boolean): StoredPage => ({
  id,
  version: 1,
  recipe: { title, parts: [{ tool: "genui_machine_list", args: {} }] },
  pinned,
  savedAt: "2026-11-17T08:03:00.000Z",
})

test("each pinned page is an entry of the sidebar with its title and its address; the others are none", () => {
  const entries = pinnedEntries([page("a1", "Morning round", true), page("b2", "Overnight", false), page("c3", "P-04", true)])
  assert.deepEqual(
    entries.map(({ title, path, order }) => ({ title, path, order })),
    [
      { title: "Morning round", path: "/pages/a1", order: undefined },
      { title: "P-04", path: "/pages/c3", order: undefined },
    ],
  )
  assert.equal(typeof entries[0]?.icon, "object")
})

test("no pages, no entries", () => {
  assert.deepEqual(pinnedEntries([]), [])
})
