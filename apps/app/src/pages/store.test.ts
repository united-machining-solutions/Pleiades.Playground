import assert from "node:assert/strict"
import { test } from "node:test"

import type { Recipe } from "./recipe.ts"
import { PAGES_KEY, createPageStore, pagesOf } from "./store.ts"
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

/** One storage in memory for one store: the store asks for its storage at every read and write. */
function stored(): () => Backing {
  const storage = memory()
  return () => storage
}

const recipe: Recipe = { title: "Morning round", parts: [{ tool: "genui_machine_list", args: {} }] }
const other: Recipe = { title: "P-04", parts: [{ tool: "genui_machine_show", args: { machine: "P-04" } }] }

test("a saved recipe is a page of its own: an id, version 1, not pinned, and when it was saved", () => {
  const pages = createPageStore(stored())
  const id = pages.savePage(recipe)
  assert.match(id ?? "", /^[0-9a-f]{12}$/)
  const page = pages.getPage(id ?? "")
  assert.deepEqual(page?.recipe, recipe)
  assert.equal(page?.version, 1)
  assert.equal(page?.pinned, false)
  assert.equal(Number.isNaN(Date.parse(page?.savedAt ?? "")), false)
})

test("the newest page comes first, and each has an id of its own", () => {
  const pages = createPageStore(stored())
  const first = pages.savePage(recipe)
  const second = pages.savePage(other, { pinned: true })
  assert.deepEqual(
    pages.listPages().map((page) => page.id),
    [second, first],
  )
  assert.notEqual(first, second)
  assert.equal(pages.getPage(second ?? "")?.pinned, true)
})

test("a recipe that does not keep the schema is not saved", () => {
  const storage = memory()
  const pages = createPageStore(() => storage)
  assert.equal(pages.savePage({ title: "", parts: [] }), null)
  assert.deepEqual(storage.held, {})
})

test("rename, pin, unpin and delete change the page of that id and no other", () => {
  const pages = createPageStore(stored())
  const id = pages.savePage(recipe) ?? ""
  const kept = pages.savePage(other) ?? ""
  assert.equal(pages.renamePage(id, "  Overnight "), true)
  assert.equal(pages.getPage(id)?.recipe.title, "Overnight")
  assert.equal(pages.pinPage(id), true)
  assert.equal(pages.getPage(id)?.pinned, true)
  assert.equal(pages.unpinPage(id), true)
  assert.equal(pages.getPage(id)?.pinned, false)
  assert.equal(pages.deletePage(id), true)
  assert.equal(pages.getPage(id), undefined)
  assert.deepEqual(pages.getPage(kept)?.recipe, other)
})

test("an empty or too long title keeps the old one, and an id nobody has changes nothing", () => {
  const pages = createPageStore(stored())
  const id = pages.savePage(recipe) ?? ""
  assert.equal(pages.renamePage(id, " "), false)
  assert.equal(pages.renamePage(id, "x".repeat(121)), false)
  assert.equal(pages.getPage(id)?.recipe.title, "Morning round")
  assert.equal(pages.renamePage("nobody", "Overnight"), false)
  assert.equal(pages.pinPage("nobody"), false)
  assert.equal(pages.deletePage("nobody"), false)
})

test("the pages are read again only when the storage holds something else", () => {
  const storage = memory()
  const pages = createPageStore(() => storage)
  pages.savePage(recipe)
  const read = pages.listPages()
  assert.equal(pages.listPages(), read)
  pages.savePage(other)
  assert.notEqual(pages.listPages(), read)
})

test("every change is told to whoever listens, until they stop", () => {
  const pages = createPageStore(stored())
  let told = 0
  const stop = pages.subscribe(() => {
    told += 1
  })
  const id = pages.savePage(recipe) ?? ""
  pages.pinPage(id)
  pages.renamePage(id, "Overnight")
  pages.deletePage(id)
  assert.equal(told, 4)
  stop()
  pages.savePage(recipe)
  assert.equal(told, 4)
})

test("a browser that blocks the storage has no pages, and nothing breaks", () => {
  const blocked: Backing = {
    getItem: () => {
      throw new DOMException("The operation is insecure.", "SecurityError")
    },
    setItem: () => {
      throw new DOMException("The operation is insecure.", "SecurityError")
    },
  }
  for (const backing of [() => blocked, () => undefined]) {
    const pages = createPageStore(backing)
    assert.deepEqual(pages.listPages(), [])
    assert.equal(pages.savePage(recipe), null)
    assert.equal(pages.getPage("3f2a9c1e0b7d"), undefined)
    assert.equal(pages.renamePage("3f2a9c1e0b7d", "Overnight"), false)
  }
  const gone = createPageStore(() => {
    throw new DOMException("Access is denied.", "SecurityError")
  })
  assert.deepEqual(gone.listPages(), [])
  assert.equal(gone.savePage(recipe), null)
})

test("a full storage does not take the page, and the pages stay as they were", () => {
  const storage = memory()
  const pages = createPageStore(() => storage)
  const id = pages.savePage(recipe)
  storage.setItem = () => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError")
  }
  assert.equal(pages.savePage(other), null)
  assert.deepEqual(
    pages.listPages().map((page) => page.id),
    [id],
  )
})

test("what the storage holds and does not keep the schema is no page", () => {
  const page = { id: "3f2a9c1e0b7d", version: 1, recipe, pinned: false, savedAt: "2026-11-17T08:03:00.000Z" }
  assert.deepEqual(pagesOf(null), [])
  assert.deepEqual(pagesOf("not JSON"), [])
  assert.deepEqual(pagesOf('{"pages":[]}'), [])
  assert.deepEqual(pagesOf(JSON.stringify([page])), [page])
  // A page that does not keep it is left out, the others stay; an id counts once.
  const broken = { ...page, id: "a1", recipe: { title: "", parts: [] } }
  assert.deepEqual(pagesOf(JSON.stringify([broken, page, { ...page, pinned: true }, 42])), [page])
})

test("the pages stand under one key with a version in its name", () => {
  const storage = memory()
  createPageStore(() => storage).savePage(recipe)
  assert.deepEqual(Object.keys(storage.held), [PAGES_KEY])
  assert.match(PAGES_KEY, /\.v1$/)
})
