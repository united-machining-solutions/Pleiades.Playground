import { createRouter } from "@tanstack/react-router"

import type { NavEntry } from "@/components/nav.ts"

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
