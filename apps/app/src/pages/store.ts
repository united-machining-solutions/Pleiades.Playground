import { useSyncExternalStore } from "react"

import { recipeSchema, storedPageSchema, titleSchema } from "./recipe.ts"
import type { Recipe, RecipePart, StoredPage } from "./recipe.ts"

// The pages of this browser, in its localStorage: no service of the stack keeps them, and nobody
// signs in. The pages are an array of stored pages under one key, the newest first. A page that
// does not keep the schema is left out when the pages are read, and so are all of them where the
// browser blocks the storage or it holds something else: the app then has no pages, and does not
// break. Every read and every write goes through here, and the sidebar follows a change through
// `usePages`, also one made in another tab.

/** The key of the pages. A new shape of a stored page gets a new key: an app never reads one it does not know. */
export const PAGES_KEY = "pleiades-playground.pages.v1"

/** What the pages are kept in: `localStorage`, or a stand-in in a test. */
export type Backing = Pick<Storage, "getItem" | "setItem">

const NONE: ReadonlyArray<StoredPage> = Object.freeze([])

/** The pages in what the storage holds: those that keep the schema, each id once. */
export function pagesOf(raw: string | null): ReadonlyArray<StoredPage> {
  if (raw === null) return NONE
  let held: unknown
  try {
    held = JSON.parse(raw)
  } catch {
    return NONE
  }
  if (!Array.isArray(held)) return NONE
  const pages: Array<StoredPage> = []
  for (const one of held) {
    const page = storedPageSchema.safeParse(one)
    if (page.success && !pages.some((other) => other.id === page.data.id)) pages.push(page.data)
  }
  return pages
}

/** Whether `at` is the place of a part: a whole number from 0 to one less than the parts. */
function placeIn(parts: ReadonlyArray<RecipePart>, at: number): boolean {
  return Number.isInteger(at) && at >= 0 && at < parts.length
}

/** A new id: twelve hex digits, safe in an address. `crypto.randomUUID` needs https, this does not. */
function newId(taken: ReadonlyArray<StoredPage>): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(6))
    const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
    if (!taken.some((page) => page.id === id)) return id
  }
}

/**
 * The pages of one storage. The app has one, for `localStorage` (below); a test makes its own.
 * A write returns whether the storage took it.
 */
export function createPageStore(backing: () => Backing | undefined) {
  const listeners = new Set<() => void>()
  let read: { raw: string | null; pages: ReadonlyArray<StoredPage> } = { raw: null, pages: NONE }

  /** The pages as the storage holds them now. The same array as long as the storage holds the same. */
  function listPages(): ReadonlyArray<StoredPage> {
    let raw: string | null = null
    try {
      raw = backing()?.getItem(PAGES_KEY) ?? null
    } catch {
      // Blocked by the browser: no pages.
    }
    if (raw !== read.raw) read = { raw, pages: pagesOf(raw) }
    return read.pages
  }

  function write(pages: ReadonlyArray<StoredPage>): boolean {
    try {
      const storage = backing()
      if (!storage) return false
      storage.setItem(PAGES_KEY, JSON.stringify(pages))
    } catch {
      // Blocked, or full.
      return false
    }
    for (const listener of listeners) listener()
    return true
  }

  /** The pages with one of them changed. False if there is no such page, or the storage did not take it. */
  function change(id: string, changed: (page: StoredPage) => StoredPage): boolean {
    const pages = listPages()
    if (!pages.some((page) => page.id === id)) return false
    return write(pages.map((page) => (page.id === id ? changed(page) : page)))
  }

  /**
   * The page with other parts, in another order or fewer. False if there is no such page, `changed`
   * returns null, the recipe with the new parts does not keep the schema (a page keeps one part at
   * least, and `MAX_PARTS` at most), or the storage did not take it.
   */
  function changeParts(id: string, changed: (parts: ReadonlyArray<RecipePart>) => Array<RecipePart> | null): boolean {
    const page = listPages().find((one) => one.id === id)
    if (!page) return false
    const parts = changed(page.recipe.parts)
    if (parts === null) return false
    const recipe = recipeSchema.safeParse({ ...page.recipe, parts })
    if (!recipe.success) return false
    return change(id, (kept) => ({ ...kept, recipe: recipe.data }))
  }

  /** The other tabs of this browser write to the same storage, and the browser says so. */
  function onStorage(event: StorageEvent) {
    if (event.key === PAGES_KEY || event.key === null) for (const listener of listeners) listener()
  }

  return {
    listPages,

    /** One page, or undefined if this browser keeps none of that id. */
    getPage(id: string): StoredPage | undefined {
      return listPages().find((page) => page.id === id)
    },

    /**
     * Keeps a recipe as a new page, the newest first, and returns its id. Null if the recipe does
     * not keep the schema or the browser does not keep it, because the storage is blocked or full.
     */
    savePage(recipe: Recipe, options: { pinned?: boolean } = {}): string | null {
      const checked = recipeSchema.safeParse(recipe)
      if (!checked.success) return null
      const pages = listPages()
      const page: StoredPage = {
        id: newId(pages),
        version: 1,
        recipe: checked.data,
        pinned: options.pinned ?? false,
        savedAt: new Date().toISOString(),
      }
      return write([page, ...pages]) ? page.id : null
    },

    /** Gives a page another title. False if the title is empty or too long, or there is no such page. */
    renamePage(id: string, title: string): boolean {
      const checked = titleSchema.safeParse(title)
      if (!checked.success) return false
      return change(id, (page) => ({ ...page, recipe: { ...page.recipe, title: checked.data } }))
    },

    /** Puts a page into the sidebar, on the top level like Home. */
    pinPage(id: string): boolean {
      return change(id, (page) => ({ ...page, pinned: true }))
    },

    /** Takes a page out of the sidebar. It stays under "Pages". */
    unpinPage(id: string): boolean {
      return change(id, (page) => ({ ...page, pinned: false }))
    },

    /**
     * Takes the part at place `at` (from 0) off a page; the others keep their order. False if the page
     * has no part there, or it is its only part: a page keeps one at least, and "Delete page" is for
     * the rest. Nothing else keeps the part, so whoever removes it keeps it for `putPartBack`.
     */
    removePart(id: string, at: number): boolean {
      return changeParts(id, (parts) => (placeIn(parts, at) ? parts.filter((_, index) => index !== at) : null))
    },

    /**
     * Puts the part at place `from` to place `to` (both from 0); the parts between move up or down by
     * one. False if either place is not on the page, or they are the same.
     */
    movePart(id: string, from: number, to: number): boolean {
      return changeParts(id, (parts) => {
        if (!placeIn(parts, from) || !placeIn(parts, to) || from === to) return null
        const moved = [...parts]
        const [part] = moved.splice(from, 1)
        moved.splice(to, 0, part)
        return moved
      })
    },

    /**
     * Puts a removed part back at place `at`, or at the end if the page has fewer parts by now: the
     * undo of `removePart`. False if the part does not keep the schema, or the page holds as many
     * parts as a page may.
     */
    putPartBack(id: string, at: number, part: RecipePart): boolean {
      if (!Number.isInteger(at) || at < 0) return false
      return changeParts(id, (parts) => [...parts.slice(0, at), part, ...parts.slice(at)])
    },

    /** Deletes a page. This browser was the only place that kept it. */
    deletePage(id: string): boolean {
      const pages = listPages()
      if (!pages.some((page) => page.id === id)) return false
      return write(pages.filter((page) => page.id !== id))
    },

    /** Calls `listener` after every change of the pages, in this tab or another one. Returns the way to stop. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage)
      }
    },
  }
}

const browser = createPageStore(() => (typeof window === "undefined" ? undefined : window.localStorage))

export const {
  listPages,
  getPage,
  savePage,
  renamePage,
  pinPage,
  unpinPage,
  removePart,
  movePart,
  putPartBack,
  deletePage,
  subscribe,
} = browser

/** The pages of this browser, the newest first. A component that reads them follows every change. */
export function usePages(): ReadonlyArray<StoredPage> {
  return useSyncExternalStore(subscribe, listPages, () => NONE)
}

/** One page of this browser, or undefined. A component that reads it follows every change. */
export function usePage(id: string): StoredPage | undefined {
  return usePages().find((page) => page.id === id)
}
