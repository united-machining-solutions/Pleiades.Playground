import { createFileRoute, redirect } from "@tanstack/react-router"

import { pageOfSearch, showOf } from "@/sites/filter.ts"
import { movedSitesPage } from "@/sites/moved.ts"

/**
 * The address of the list of sites before Home showed it. It shows nothing and leads to `/`, with
 * "Needs you" and the page, so a link someone shared goes on working.
 */
export const Route = createFileRoute("/sites/")({
  validateSearch: (search): { show?: "needs" | undefined; page?: number | undefined } => ({
    show: showOf(search.show),
    page: pageOfSearch(search.page),
  }),
  beforeLoad: ({ search }) => {
    throw redirect(movedSitesPage(search))
  },
})
