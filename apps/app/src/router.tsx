import { createRouter } from "@tanstack/react-router"

import type { NavEntry } from "@/components/nav.ts"

// Not in the repository: this file is written from the files under routes/, by `pnpm install`, the
// typecheck, the development server and the build. See route-tree.mjs, and the README of the app.
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  return createRouter({ routeTree, scrollRestoration: true })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
  /** What a route says about itself in its `staticData`: its entry in the sidebar, if it has one. */
  interface StaticDataRouteOption {
    nav?: NavEntry
  }
}
