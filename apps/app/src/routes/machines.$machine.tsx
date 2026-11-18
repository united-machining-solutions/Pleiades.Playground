import { createFileRoute, redirect } from "@tanstack/react-router"

import { hoursOf } from "@/machines/switcher.ts"
import type { Hours } from "@/machines/switcher.ts"
import { movedMachinePage } from "@/sites/moved.ts"

/**
 * The address the page of a machine had before it moved under Sites. It shows nothing and leads
 * to `/sites/$machine`, with the hours of the history and the open chat, so a link someone shared
 * goes on working.
 */
export const Route = createFileRoute("/machines/$machine")({
  // The search the page of a machine reads; the open chat comes with it from the root.
  validateSearch: (search): { hours?: Hours | undefined } => ({ hours: hoursOf(search.hours) }),
  beforeLoad: ({ params, search }) => {
    throw redirect(movedMachinePage(params.machine, search))
  },
})
