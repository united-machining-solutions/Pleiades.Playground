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
}

/**
 * What a page is called in the breadcrumb of the header, where the title of its entry does not say
 * it: a text, or one made from the parameters of its route. Home is called "Machines" there, and
 * the page of a machine by its machine.
 */
export type Crumb = string | ((params: Record<string, string>) => string)

/** An entry with the path of its page, and what the page is called in the breadcrumb. */
export type NavPage = NavEntry & { path: string; crumb?: Crumb }

type RouteLike = { fullPath: string; options: { staticData?: { nav?: NavEntry; crumb?: Crumb } } }

/** The pages that name an entry, in the order of the sidebar. */
export function navPages(routes: ReadonlyArray<RouteLike>): Array<NavPage> {
  return routes
    .flatMap((route) => {
      const { nav, crumb } = route.options.staticData ?? {}
      return nav ? [{ ...nav, path: route.fullPath, crumb }] : []
    })
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title))
}

/**
 * The entry a person is under: the page itself, or the nearest page above it that has an entry.
 * The page of a machine has none, so it stands under Home.
 */
export function activePage(pages: ReadonlyArray<NavPage>, pathname: string): NavPage | undefined {
  const above = (path: string) => path === "/" || pathname === path || pathname.startsWith(`${path}/`)
  return pages.filter((page) => above(page.path)).sort((a, b) => b.path.length - a.path.length)[0]
}

/** One step of the breadcrumb. A step that leads somewhere has a path; the page itself has none. */
export type CrumbStep = { title: string; path?: string }

/** The page a person is on, as the router knows it. */
type ShownPage = {
  /** The path of its route, with the names of its parameters: "/machines/$machine". */
  fullPath: string
  /** The path in the address: "/machines/P-04". */
  pathname: string
  params: Record<string, string>
  staticData?: { nav?: NavEntry; crumb?: Crumb }
}

/**
 * The breadcrumb of a page: the entry of the sidebar it stands under, if that is another page, and
 * then the page itself. A page is called by its `crumb`, or by the title of its entry. So a new
 * page with an entry has its breadcrumb without a word about it.
 */
export function crumbsOf(pages: ReadonlyArray<NavPage>, page: ShownPage): Array<CrumbStep> {
  const text = (crumb: Crumb | undefined, params: Record<string, string>) =>
    typeof crumb === "function" ? crumb(params) : crumb
  const steps: Array<CrumbStep> = []
  const under = activePage(pages, page.pathname)
  if (under && under.path !== page.fullPath) {
    steps.push({ title: text(under.crumb, {}) ?? under.title, path: under.path })
  }
  const own = text(page.staticData?.crumb, page.params) ?? page.staticData?.nav?.title
  if (own) steps.push({ title: own })
  return steps
}
