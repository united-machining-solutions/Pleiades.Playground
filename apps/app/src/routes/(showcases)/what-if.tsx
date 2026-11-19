import { createFileRoute, redirect } from "@tanstack/react-router"

import { withWhatIf } from "@/showcases/what-if/orders.ts"
import { addFloorExtra } from "@/where-is-my-job/extras.ts"

// What if an order passed several machines? This showcase offers made-up orders (numbers "WI-…") as
// a switch on the page "Where is My Job?", because no source of the stack sends an order across
// machines yet. It is offered when this file is loaded, which a build with APP_SHOWCASES does with
// the route tree; its own address only leads to that page.
addFloorExtra({
  id: "what-if",
  label: "What if",
  about:
    "What if an order passed several machines? The machines and their state are real; the orders numbered WI-… are made up. Each passes several steps of manufacturing, a machine of each, then packing. No source of the stack sends an order across machines yet.",
  decorate: withWhatIf,
})

export const Route = createFileRoute("/(showcases)/what-if")({
  beforeLoad: () => {
    throw redirect({ to: "/where-is-my-job" })
  },
})
