import { createFileRoute } from "@tanstack/react-router"
import { RouteIcon } from "lucide-react"

import { withWhatIf } from "@/showcases/what-if/orders.ts"
import type { FloorExtra } from "@/where-is-my-job/extras.ts"
import { FloorView } from "@/where-is-my-job/floor-view.tsx"
import { getFloor } from "@/where-is-my-job/get-floor.ts"

// What if an order passed several machines? No source of the stack sends an order across machines
// yet. This showcase is the page "Where is My Job?" with made-up orders (numbers "WI-…") laid onto
// the real machines, at an address of its own: the page of the app stays as it is in every build
// (ADR-0018). "Real orders" above the map turns the made-up ones off.
const whatIf: FloorExtra = {
  id: "what-if",
  label: "What if",
  about:
    "What if an order passed several machines? The machines and their state are real; the orders numbered WI-… are made up. Each passes several steps of manufacturing, a machine of each, then packing. No source of the stack sends an order across machines yet.",
  decorate: withWhatIf,
}

export const Route = createFileRoute("/(showcases)/what-if")({
  // In the sidebar of a build with the showcases, as the page of the app is in every build.
  staticData: { nav: { title: "What if", icon: RouteIcon } },
  loader: () => getFloor().catch((error: unknown) => ({ values: null, error: String(error) })),
  component: WhatIf,
})

function WhatIf() {
  return <FloorView answer={Route.useLoaderData()} extras={[whatIf]} />
}
