import { createFileRoute } from "@tanstack/react-router"
import { PackageSearchIcon } from "lucide-react"

import { withWhatIf } from "@/showcases/where-is-my-job/orders.ts"
import type { FloorExtra } from "@/where-is-my-job/extras.ts"
import { FloorView } from "@/where-is-my-job/floor-view.tsx"
import { getFloor } from "@/where-is-my-job/get-floor.ts"

/**
 * Where is My Job? A basis for discussion: how an order could be followed across the shop floor. It
 * shows the machines of the stack with their real state, job orders and history, the machines of one
 * step of manufacturing side by side, and an order as every job order that names the same order number.
 *
 * It is a showcase (ADR-0018), only in a build with APP_SHOWCASES: no source of the stack sends an
 * order across machines yet, so the page opens with made-up orders (numbers "WI-…") laid onto the real
 * machines. "Real orders" above the map turns them off. The view, the map and `getFloor` are of the
 * app (`src/where-is-my-job/`); only the made-up orders are of the showcase.
 */
const whatIf: FloorExtra = {
  id: "what-if",
  label: "What if",
  about:
    "What if an order passed several machines? The machines and their state are real; the orders numbered WI-… are made up. Each passes several steps of manufacturing, a machine of each, then packing. No source of the stack sends an order across machines yet.",
  decorate: withWhatIf,
}

export const Route = createFileRoute("/(showcases)/where-is-my-job")({
  staticData: { nav: { title: "Where is My Job?", icon: PackageSearchIcon } },
  loader: () => getFloor().catch((error: unknown) => ({ values: null, error: String(error) })),
  component: WhereIsMyJob,
})

function WhereIsMyJob() {
  return <FloorView answer={Route.useLoaderData()} extras={[whatIf]} />
}
