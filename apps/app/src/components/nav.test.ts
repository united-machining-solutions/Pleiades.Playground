import assert from "node:assert/strict"
import { test } from "node:test"

import type { LucideIcon } from "lucide-react"

import { activePage, crumbsOf, navPages, sidebarPages } from "./nav.ts"

const icon = (() => null) as unknown as LucideIcon
const route = (fullPath: string, nav?: { title: string; order?: number; sidebar?: boolean }) => ({
  fullPath,
  options: { staticData: nav ? { nav: { ...nav, icon } } : undefined },
})

const routes = [
  route("/warnings", { title: "Warnings" }),
  route("/jobs/$job"),
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

test("a page without an entry is under the nearest page above it: a page of a job under Home", () => {
  assert.equal(activePage(navPages(routes), "/jobs/4711")?.title, "Home")
  assert.equal(activePage(navPages(routes), "/warnings/open")?.title, "Warnings")
})

test("a path that only begins like another is not under it", () => {
  assert.equal(activePage(navPages(routes), "/warnings-of-today")?.title, "Home")
})

test("without any entry nothing is marked", () => {
  assert.equal(activePage([], "/"), undefined)
})

// The breadcrumb. Home is called "Machines" there, as in the example app.
const withCrumbs = [
  { fullPath: "/", options: { staticData: { nav: { title: "Home", icon, order: 0 }, crumb: "Machines" } } },
  route("/warnings", { title: "Warnings" }),
  route("/jobs/$job"),
]

test("a page with an entry is called by the title of its entry, or by its crumb", () => {
  const pages = navPages(withCrumbs)
  assert.deepEqual(
    crumbsOf(pages, { fullPath: "/warnings", pathname: "/warnings", params: {}, staticData: { nav: { title: "Warnings", icon } } }),
    [{ title: "Warnings" }],
  )
  assert.deepEqual(
    crumbsOf(pages, {
      fullPath: "/",
      pathname: "/",
      params: {},
      staticData: { nav: { title: "Home", icon, order: 0 }, crumb: "Machines" },
    }),
    [{ title: "Machines" }],
  )
})

test("a page without an entry stands behind the entry it is under: a page of a job behind Machines", () => {
  assert.deepEqual(
    crumbsOf(navPages(withCrumbs), {
      fullPath: "/jobs/$job",
      pathname: "/jobs/4711",
      params: { job: "4711" },
      staticData: { crumb: (params) => params.job ?? "" },
    }),
    [{ title: "Machines", path: "/" }, { title: "4711" }],
  )
})

test("a page under another entry than Home stands behind that entry", () => {
  assert.deepEqual(
    crumbsOf(navPages(withCrumbs), {
      fullPath: "/warnings/$warning",
      pathname: "/warnings/4105",
      params: { warning: "4105" },
      staticData: { crumb: (params) => `Warning ${params.warning}` },
    }),
    [{ title: "Warnings", path: "/warnings" }, { title: "Warning 4105" }],
  )
})

// A page that gets a detail page becomes a layout, and its list moves to the index route, "/alarms/".
const withDetail = [...withCrumbs, route("/alarms", { title: "Alarms" }), route("/alarms/"), route("/alarms/$alarm")]

test("the index route of an entry is its page: called like the entry, and no link to itself", () => {
  for (const pathname of ["/alarms", "/alarms/"]) {
    assert.deepEqual(crumbsOf(navPages(withDetail), { fullPath: "/alarms/", pathname, params: {} }), [{ title: "Alarms" }])
  }
})

test("a detail page stands behind the entry whose list became an index route", () => {
  assert.deepEqual(
    crumbsOf(navPages(withDetail), {
      fullPath: "/alarms/$alarm",
      pathname: "/alarms/7",
      params: { alarm: "7" },
      staticData: { crumb: (params) => `Alarm ${params.alarm}` },
    }),
    [{ title: "Alarms", path: "/alarms" }, { title: "Alarm 7" }],
  )
})

test("an entry named by the index route itself stands on the path of its layout", () => {
  const pages = navPages([route("/", { title: "Home", order: 0 }), route("/alarms"), route("/alarms/", { title: "Alarms" })])
  assert.deepEqual(
    pages.map((page) => page.path),
    ["/", "/alarms"],
  )
  assert.equal(activePage(pages, "/alarms/7")?.title, "Alarms")
  assert.deepEqual(
    crumbsOf(pages, { fullPath: "/alarms/", pathname: "/alarms", params: {}, staticData: { nav: { title: "Alarms", icon } } }),
    [{ title: "Alarms" }],
  )
})

test("a page that says nothing about itself shows only where it stands", () => {
  assert.deepEqual(
    crumbsOf(navPages(withCrumbs), { fullPath: "/about", pathname: "/about", params: {} }),
    [{ title: "Machines", path: "/" }],
  )
  assert.deepEqual(crumbsOf([], { fullPath: "/about", pathname: "/about", params: {} }), [])
})

// Pages kept from the chat: a pinned page stands on the top level beside the pages of the routes, by
// the same rule. "Pages" is the entry the others stand under, in the breadcrumb and in the mark, but it
// is no row of the sidebar: the pages that are not pinned stand in a group (pages/listed.ts).
const withPages = [
  ...withCrumbs,
  route("/pages/", { title: "Pages", sidebar: false }),
  { fullPath: "/pages/$page", options: { staticData: { crumb: (params: Record<string, string>) => `Title of ${params.page}` } } },
]
const pinned = [
  { title: "Overnight", icon, path: "/pages/b2" },
  { title: "Morning round", icon, path: "/pages/a1" },
]

test("a pinned page stands on the top level, by its title among the pages of the routes, and Pages is no row", () => {
  const entries = navPages(withPages, pinned)
  assert.deepEqual(
    sidebarPages(entries).map((page) => [page.title, page.path]),
    [
      ["Home", "/"],
      ["Morning round", "/pages/a1"],
      ["Overnight", "/pages/b2"],
      ["Warnings", "/warnings"],
    ],
  )
  // The entry is still there for what stands under it.
  assert.deepEqual(entries.filter((page) => page.sidebar === false).map((page) => page.path), ["/pages"])
})

test("without a page kept the top level is what it was before pages: no entry Pages", () => {
  assert.deepEqual(
    sidebarPages(navPages(withPages)).map((page) => page.path),
    ["/", "/warnings"],
  )
})

test("a pinned page is marked while it is open; a page that is not pinned marks no row of the top level", () => {
  const entries = navPages(withPages, pinned)
  const rows = sidebarPages(entries)
  assert.equal(activePage(entries, "/pages/a1")?.title, "Morning round")
  assert.equal(activePage(entries, "/")?.title, "Home")
  // Under Pages, which is no row: not Home, and not another row.
  for (const pathname of ["/pages/c3", "/pages", "/pages/open"]) {
    const active = activePage(entries, pathname)
    assert.equal(active?.title, "Pages", pathname)
    assert.equal(rows.includes(active as never), false, pathname)
  }
})

test("a page kept from the chat stands behind Pages in the breadcrumb, pinned or not", () => {
  for (const page of ["a1", "c3"]) {
    assert.deepEqual(
      crumbsOf(navPages(withPages), {
        fullPath: "/pages/$page",
        pathname: `/pages/${page}`,
        params: { page },
        staticData: { crumb: (params) => `Title of ${params.page}` },
      }),
      [{ title: "Pages", path: "/pages" }, { title: `Title of ${page}` }],
    )
  }
})

test("a page this browser does not keep has no title: the breadcrumb says Pages alone", () => {
  assert.deepEqual(
    crumbsOf(navPages(withPages), { fullPath: "/pages/$page", pathname: "/pages/zz", params: { page: "zz" }, staticData: { crumb: () => "" } }),
    [{ title: "Pages", path: "/pages" }],
  )
})

test("the list of all pages is called Pages and links nowhere", () => {
  assert.deepEqual(
    crumbsOf(navPages(withPages), { fullPath: "/pages/", pathname: "/pages", params: {}, staticData: { nav: { title: "Pages", icon, sidebar: false } } }),
    [{ title: "Pages" }],
  )
})

test("a page opened from a link stands behind Pages, called by what the link says: the crumb reads the search", () => {
  const pages = navPages([
    ...withPages,
    { fullPath: "/pages/open", options: { staticData: { crumb: (_params: Record<string, string>, search: Record<string, unknown>) => String(search.r ?? "") } } },
  ])
  assert.equal(activePage(pages, "/pages/open")?.title, "Pages")
  assert.deepEqual(
    crumbsOf(pages, {
      fullPath: "/pages/open",
      pathname: "/pages/open",
      params: {},
      search: { r: "Morning round" },
      staticData: { crumb: (_params, search) => String(search.r ?? "") },
    }),
    [{ title: "Pages", path: "/pages" }, { title: "Morning round" }],
  )
})

// Home and the page of a machine under it, as the example app has them: Home, "/", lists the machines
// by site and hall, and the page of a machine "/sites/$machine" names no entry of its own. The old
// address of the list, "/sites/", only leads to "/" and has no entry either.
const homeOfSites = [
  { fullPath: "/", options: { staticData: { nav: { title: "Home", icon, order: 0 } } } },
  { fullPath: "/sites/", options: {} },
  { fullPath: "/sites/$machine", options: { staticData: { crumb: (params: Record<string, string>) => params.machine ?? "" } } },
  route("/charts", { title: "Charts" }),
]

test("Home is the first entry, and the only one for the sites: marked on its page and on the page of a machine", () => {
  const entries = navPages(homeOfSites)
  assert.deepEqual(
    sidebarPages(entries).map((one) => one.title),
    ["Home", "Charts"],
  )
  assert.equal(activePage(entries, "/")?.title, "Home")
  assert.equal(activePage(entries, "/sites/alcyone-machines_AX-400_P-04")?.title, "Home")
  assert.equal(activePage(entries, "/charts")?.title, "Charts")
})

test("the page of a machine stands behind Home in the breadcrumb, and Home leads to the first page", () => {
  assert.deepEqual(
    crumbsOf(navPages(homeOfSites), {
      fullPath: "/sites/$machine",
      pathname: "/sites/alcyone-machines_AX-400_P-04",
      params: { machine: "alcyone-machines_AX-400_P-04" },
      staticData: { crumb: (params) => params.machine ?? "" },
    }),
    [{ title: "Home", path: "/" }, { title: "alcyone-machines_AX-400_P-04" }],
  )
})

test("Home itself is called Home and does not link to itself", () => {
  assert.deepEqual(
    crumbsOf(navPages(homeOfSites), { fullPath: "/", pathname: "/", params: {}, staticData: { nav: { title: "Home", icon, order: 0 } } }),
    [{ title: "Home" }],
  )
})
