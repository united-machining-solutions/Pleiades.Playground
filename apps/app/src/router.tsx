import { createRouter } from "@tanstack/react-router"

import type { Crumb, NavEntry } from "@/components/nav.ts"

// Not in the repository: this file is written from the files under routes/, by `pnpm install`, the
// typecheck, the development server and the build. See route-tree.mjs, and the README of the app.
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  // `search.strict`: a link to a page carries the search that page validates and nothing else. The
  // links of the app keep the chat open by carrying the search along; without this, the recipe of a
  // page opened from a link (`/pages/open?r=`) would stay in the address of every page after it.
  return createRouter({ routeTree, scrollRestoration: true, search: { strict: true } })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
  /**
   * What a route says about itself in its `staticData`: its entry in the sidebar, if it has one, and
   * what it is called in the breadcrumb, where the title of the entry does not say it.
   */
  interface StaticDataRouteOption {
    nav?: NavEntry
    crumb?: Crumb
  }
}
