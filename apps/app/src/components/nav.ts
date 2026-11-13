import type { LucideIcon } from "lucide-react"

// The pages of the sidebar. A page names its entry itself, in the `staticData` of its route, so a
// new page is one file and no entry in a list that every page shares.

/** How a page stands in the sidebar: its title, its icon, and where among the others. */
export type NavEntry = {
  title: string
  icon: LucideIcon
  /** Lower comes first; 100 if omitted. Pages of the same order stand by their title. */
  order?: number
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    nav?: NavEntry
  }
}

/** An entry with the path of its page. */
export type NavPage = NavEntry & { path: string }

type RouteLike = { fullPath: string; options: { staticData?: { nav?: NavEntry } } }

/** The pages that name an entry, in the order of the sidebar. */
export function navPages(routes: ReadonlyArray<RouteLike>): Array<NavPage> {
  return routes
    .flatMap((route) => {
      const nav = route.options.staticData?.nav
      return nav ? [{ ...nav, path: route.fullPath }] : []
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
