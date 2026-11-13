import assert from "node:assert/strict"
import { test } from "node:test"

import type { LucideIcon } from "lucide-react"

import { activePage, navPages } from "./nav.ts"

const icon = (() => null) as unknown as LucideIcon
const route = (fullPath: string, nav?: { title: string; order?: number }) => ({
  fullPath,
  options: { staticData: nav ? { nav: { ...nav, icon } } : undefined },
})

const routes = [
  route("/warnings", { title: "Warnings" }),
  route("/machines/$machine"),
  route("/alarms", { title: "Alarms" }),
  route("/", { title: "Home", order: 0 }),
  route("/health"),
]

test("only the pages that name an entry stand in the sidebar", () => {
  assert.deepEqual(
    navPages(routes).map((page) => page.path),
    ["/", "/alarms", "/warnings"],
  )
})

test("a lower order comes first, and pages of the same order stand by their title", () => {
  const pages = navPages([
    route("/b", { title: "B" }),
    route("/a", { title: "A" }),
    route("/z", { title: "Z", order: 1 }),
  ])
  assert.deepEqual(
    pages.map((page) => page.title),
    ["Z", "A", "B"],
  )
})

test("a page with an entry is under its own entry", () => {
  assert.equal(activePage(navPages(routes), "/warnings")?.title, "Warnings")
  assert.equal(activePage(navPages(routes), "/")?.title, "Home")
})

test("a page without an entry is under the nearest page above it: the page of a machine under Home", () => {
  assert.equal(activePage(navPages(routes), "/machines/P-04")?.title, "Home")
  assert.equal(activePage(navPages(routes), "/warnings/open")?.title, "Warnings")
})

test("a path that only begins like another is not under it", () => {
  assert.equal(activePage(navPages(routes), "/warnings-of-today")?.title, "Home")
})

test("without any entry nothing is marked", () => {
  assert.equal(activePage([], "/"), undefined)
})
