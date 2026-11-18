import type { LucideIcon } from "lucide-react"

// The pages of the sidebar, and the breadcrumb of the header. A page names its entry itself, in the
// `staticData` of its route, so a new page is one file and no entry in a list that every page
// shares. The router knows the entry as `staticData.nav` and the name in the breadcrumb as
// `staticData.crumb`: router.tsx says so, next to the other thing it registers.

/** How a page stands in the sidebar: its title, its icon, and where among the others. */
export type NavEntry = {
  title: string
  icon: LucideIcon
  /** Lower comes first; 100 if omitted. Pages of the same order stand by their title. */
  order?: number
  /**
   * False for a page that is no row of the top level of the sidebar, because the sidebar lists what
   * is under it in a group of its own ("Pages", see app-sidebar.tsx). The page still has its entry:
   * the pages under it stand behind it in the breadcrumb, and a person on one of them is under it
   * and not under Home. True if omitted.
   */
  sidebar?: boolean
}

/**
 * What a page is called in the breadcrumb of the header, where the title of its entry does not say
 * it: a text, or one made from the parameters of its route, and from its search where the page is
 * named there (a page opened from a link is called by the title in the link). Home is called
 * "Machines" there, and the page of a machine by its machine.
 */
export type Crumb = string | ((params: Record<string, string>, search: Record<string, unknown>) => string)

/** An entry with the path of its page, and what the page is called in the breadcrumb. */
export type NavPage = NavEntry & { path: string; crumb?: Crumb }

type RouteLike = { fullPath: string; options: { staticData?: { nav?: NavEntry; crumb?: Crumb } } }

/**
 * The path a route answers on. An index route ends in a slash, "/alarms/", and is the page of
 * "/alarms": a page that gets a detail page becomes a layout, and its list moves to the index route.
 */
function pathOf(fullPath: string): string {
  return fullPath.length > 1 && fullPath.endsWith("/") ? fullPath.slice(0, -1) : fullPath
}

/**
 * The pages that name an entry, in the order of the sidebar. `pinned` are the entries of the pages
 * a person kept from the chat and pinned (pages/pinned.ts): they stand on the top level beside the
 * pages of the routes, by the same rule, and none is under another entry.
 */
export function navPages(routes: ReadonlyArray<RouteLike>, pinned: ReadonlyArray<NavPage> = []): Array<NavPage> {
  return routes
    .flatMap((route): Array<NavPage> => {
      const { nav, crumb } = route.options.staticData ?? {}
      return nav ? [{ ...nav, path: pathOf(route.fullPath), crumb }] : []
    })
    .concat(pinned)
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title))
}

/** The entries that are a row of the top level of the sidebar: all but those that say `sidebar: false`. */
export function sidebarPages(pages: ReadonlyArray<NavPage>): Array<NavPage> {
  return pages.filter((page) => page.sidebar !== false)
}

/**
 * The entry a person is under: the page itself, or the nearest page above it that has an entry.
 * The page of a machine has none, so it stands under Sites. A pinned page is its own entry; one that
 * is not pinned stands under "Pages", which is no row of the sidebar, so no row of the top level is
 * marked for it (its row is in the group, pages/listed.ts).
 */
export function activePage(pages: ReadonlyArray<NavPage>, pathname: string): NavPage | undefined {
  const above = (path: string) => path === "/" || pathname === path || pathname.startsWith(`${path}/`)
  return pages.filter((page) => above(page.path)).sort((a, b) => b.path.length - a.path.length)[0]
}

/** One step of the breadcrumb. A step that leads somewhere has a path; the page itself has none. */
export type CrumbStep = { title: string; path?: string }

/** The page a person is on, as the router knows it. */
type ShownPage = {
  /** The path of its route, with the names of its parameters: "/sites/$machine". */
  fullPath: string
  /** The path in the address: "/sites/P-04". */
  pathname: string
  params: Record<string, string>
  /** What the address says after the question mark, as the route validated it. */
  search?: Record<string, unknown>
  staticData?: { nav?: NavEntry; crumb?: Crumb }
}

/**
 * The breadcrumb of a page: the entry of the sidebar it stands under, if that is another page, and
 * then the page itself. A page is called by its `crumb`, or by the title of its entry. So a new
 * page with an entry has its breadcrumb without a word about it. The index route of an entry is its
 * page: it is called like the entry, unless it says otherwise, and never links to itself.
 *
 * `pages` are the entries of the routes alone, without the pinned pages: a page kept from the chat
 * stands behind "Pages" in the breadcrumb, pinned or not.
 */
export function crumbsOf(pages: ReadonlyArray<NavPage>, page: ShownPage): Array<CrumbStep> {
  const search = page.search ?? {}
  const text = (crumb: Crumb | undefined, params: Record<string, string>, searched: Record<string, unknown>) =>
    typeof crumb === "function" ? crumb(params, searched) : crumb
  const steps: Array<CrumbStep> = []
  const under = activePage(pages, page.pathname)
  const isEntry = under !== undefined && under.path === pathOf(page.fullPath)
  if (under && !isEntry) {
    steps.push({ title: text(under.crumb, {}, {}) ?? under.title, path: under.path })
  }
  const own =
    text(page.staticData?.crumb, page.params, search) ??
    page.staticData?.nav?.title ??
    (isEntry ? (text(under.crumb, page.params, search) ?? under.title) : undefined)
  if (own) steps.push({ title: own })
  return steps
}
