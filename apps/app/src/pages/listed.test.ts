import assert from "node:assert/strict"
import { test } from "node:test"

import { listedRows, markedRow } from "./listed.ts"
import { pinnedEntries } from "./pinned.ts"
import type { StoredPage } from "./recipe.ts"

const page = (id: string, title: string, pinned = false): StoredPage => ({
  id,
  version: 1,
  recipe: { title, parts: [{ tool: "genui_machine_list", args: {} }] },
  pinned,
  savedAt: "2026-11-17T08:00:00.000Z",
})

// The store has the newest first.
const pages = [
  page("c3", "Alarms this week"),
  page("b2", "Night shift", true),
  page("a1", "How were P-04 and P-07 overnight?"),
]

test("the group lists the pages that are not pinned, as the store has them: the newest first", () => {
  assert.deepEqual(listedRows(pages), [
    { id: "c3", title: "Alarms this week", path: "/pages/c3" },
    { id: "a1", title: "How were P-04 and P-07 overnight?", path: "/pages/a1" },
  ])
})

test("a pinned page stands on the top level and is not listed a second time", () => {
  assert.deepEqual(
    pinnedEntries(pages).map((entry) => entry.title),
    ["Night shift"],
  )
  assert.equal(listedRows(pages).some((row) => row.id === "b2"), false)
  // Every page is in one place: pinned, or in the group.
  assert.equal(listedRows(pages).length + pinnedEntries(pages).length, pages.length)
})

test("a page that is pinned or unpinned moves between the top level and the group", () => {
  assert.deepEqual(
    listedRows(pages.map((one) => (one.id === "c3" ? { ...one, pinned: true } : one))).map((row) => row.id),
    ["a1"],
  )
  assert.deepEqual(
    listedRows(pages.map((one) => ({ ...one, pinned: false }))).map((row) => row.id),
    ["c3", "b2", "a1"],
  )
})

test("without a page kept, or with every page pinned, there is no row, so no group", () => {
  assert.deepEqual(listedRows([]), [])
  assert.deepEqual(listedRows(pages.map((one) => ({ ...one, pinned: true }))), [])
})

test("a title is the title of the recipe: a renamed page is a row with its new name", () => {
  const renamed = pages.map((one) => (one.id === "a1" ? { ...one, recipe: { ...one.recipe, title: "Overnight" } } : one))
  assert.equal(listedRows(renamed).at(-1)?.title, "Overnight")
})

test("the row of the page a person is on is marked", () => {
  const rows = listedRows(pages)
  assert.equal(markedRow(rows, "/pages/c3")?.id, "c3")
  assert.equal(markedRow(rows, "/pages/a1")?.id, "a1")
  assert.equal(markedRow(rows, "/pages/a1/")?.id, "a1")
})

test("no row is marked for a pinned page, the list of the pages, a page that is not kept or a page opened from a link", () => {
  const rows = listedRows(pages)
  for (const pathname of ["/pages/b2", "/pages", "/pages/", "/pages/zz", "/pages/open", "/pages/c3/more", "/", "/machines/P-04"]) {
    assert.equal(markedRow(rows, pathname), undefined, pathname)
  }
})
