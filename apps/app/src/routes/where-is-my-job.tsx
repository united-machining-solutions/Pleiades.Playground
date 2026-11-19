import { createFileRoute } from "@tanstack/react-router"
import { PackageSearchIcon } from "lucide-react"

import { getFloor } from "@/where-is-my-job/get-floor.ts"
import { FloorView } from "@/where-is-my-job/floor-view.tsx"

/**
 * Where is My Job? A basis for discussion: how an order could be followed across the shop floor.
 * It shows the machines of the stack with their real state, job orders and history, the machines of
 * one step of manufacturing side by side, and an order as every job order that names the same order
 * number. What the stack has no source for yet, the programming before the machines, the packing
 * after them, and a part by its sheet and position, stands on the page as such. The chat does not
 * know the page.
 *
 * It is a page of the app, with its entry in the sidebar: it reads only values the stack has.
 */
export const Route = createFileRoute("/where-is-my-job")({
  staticData: { nav: { title: "Where is My Job?", icon: PackageSearchIcon } },
  loader: () => getFloor().catch((error: unknown) => ({ values: null, error: String(error) })),
  component: WhereIsMyJob,
})

function WhereIsMyJob() {
  return <FloorView answer={Route.useLoaderData()} />
}
