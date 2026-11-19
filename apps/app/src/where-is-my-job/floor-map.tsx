import type { MachineShow, State } from "@pleiades/cards/machine/contract.ts"
import { titleOf } from "@pleiades/cards/machine/in-words.ts"
import { stateLabel, stateOf } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Item, ItemContent, ItemFooter, ItemHeader, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"
import { Meter } from "@pleiades/ui/components/meter"
import { ScrollArea, ScrollBar } from "@pleiades/ui/components/scroll-area"
import { cn } from "cn"
import {
  CircleDotIcon,
  CodeXmlIcon,
  DrillIcon,
  FactoryIcon,
  FoldHorizontalIcon,
  LinkIcon,
  PackageIcon,
  PrinterIcon,
  RotateCwIcon,
  ScissorsIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { TILE_HEIGHT, TILE_WIDTH, conceptStations, connector, layout, pathOf, utilisation, waiting } from "./floor.ts"
import type { Cluster, FloorPage, Order, OrderState, Place } from "./floor.ts"
import type { StepId } from "./steps.ts"
import { makerOf } from "./makers.ts"

/** The icon of a step of manufacturing; a machine with no step keeps the factory. */
const stepIcon: Record<StepId | "none", LucideIcon> = {
  printing: PrinterIcon,
  cutting: ScissorsIcon,
  turning: RotateCwIcon,
  milling: DrillIcon,
  grinding: CircleDotIcon,
  forming: FoldHorizontalIcon,
  joining: LinkIcon,
  none: FactoryIcon,
}

/** The edge of a tile in the colour of its state, so the floor reads from afar. */
const stripe: Record<State, string> = {
  running: "shadow-[inset_4px_0_0_var(--state-running)]",
  setup: "shadow-[inset_4px_0_0_var(--state-setup-edge)]",
  stopped: "shadow-[inset_4px_0_0_var(--state-stopped)]",
  alarm: "shadow-[inset_4px_0_0_var(--state-alarm)]",
  "no-data": "shadow-[inset_4px_0_0_var(--state-no-data-edge)]",
}

export type Lens = "load" | "queue"

/** The marker on the tile where the chosen order stands, by its state. */
const orderBadge: Record<OrderState, { label: string; variant: "default" | "destructive" | "secondary" }> = {
  running: { label: "Order is here", variant: "default" },
  waiting: { label: "Order waits here", variant: "default" },
  interrupted: { label: "Order held up here", variant: "destructive" },
  aborted: { label: "Order aborted here", variant: "destructive" },
  ended: { label: "Order done here", variant: "secondary" },
}

/** A share as a whole percentage. */
export function percent(share: number | null): string {
  return share === null ? "–" : `${Math.round(share * 100)} %`
}

/**
 * The shop floor from above: programming, a tile for every machine of the stack, packing. The stack
 * knows no flow between the machines, so no line stands until an order is chosen: then its path is
 * drawn, solid between the machines it has reached, dashed to those it waits for, dotted to the steps
 * that publish nothing yet.
 */
export function FloorMap({
  page,
  orders,
  clusters,
  lens,
  machine,
  order,
  onMachine,
  onOrder,
}: {
  page: FloorPage
  clusters?: ReadonlyArray<Cluster>
  orders: ReadonlyArray<Order>
  lens: Lens
  machine: string | null
  order: Order | null
  onMachine: (id: string) => void
  onOrder: (key: string) => void
}) {
  const { places, clusters: named, width, height } = layout(
    page.machines.map((one) => one.show.machine.machine),
    clusters,
  )
  const iconOf = (id: string) =>
    stepIcon[(clusters?.find((one) => one.machines.includes(id))?.id ?? "none") as StepId | "none"] ?? FactoryIcon
  const placeOf = Object.fromEntries(places.map((one) => [one.id, one])) as Record<string, Place>
  const path = order ? pathOf(order) : []
  const reached = order ? order.steps.filter((step) => step.result !== null).length : 0

  return (
    <ScrollArea className="rounded-lg border bg-muted/30">
      <div
        className="relative m-2 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[16px_16px]"
        style={{ width: width + 12, height: height + 8 }}
      >
        {/* The path of the chosen order: no component draws a line between two places, so these are our own. */}
        {path.slice(1).map((to, index) => {
          const from = path[index]!
          const concept = from.startsWith("concept:") || to.startsWith("concept:")
          // The machine `to` is step `index` of the order (step 0 follows programming).
          const look = concept ? "concept" : index < reached ? "done" : "plan"
          return connector(placeOf[from]!, placeOf[to]!).map(([axis, a, b, c], segment) => (
            <span
              key={`${index}-${segment}`}
              aria-hidden
              className={cn(
                "absolute border-primary",
                look === "plan" && "border-dashed",
                look === "concept" && "border-dotted border-muted-foreground",
              )}
              style={
                axis === "h"
                  ? { left: a, top: c - 2, width: b - a, borderTopWidth: 4 }
                  : { left: a - 2, top: b, height: c - b, borderLeftWidth: 4 }
              }
            />
          ))
        })}
        {/* The name of each cluster above its columns. */}
        {named.map((one) => (
          <span
            key={one.id}
            className="absolute truncate border-b pb-1 text-xs font-medium text-muted-foreground"
            style={{ left: one.x, top: 0, width: one.width }}
          >
            {one.name} · {clusters?.find((cluster) => cluster.id === one.id)?.machines.length ?? 0}
          </span>
        ))}
        {places.map((place) => {
          if (place.id === conceptStations.program.id || place.id === conceptStations.pack.id) {
            const concept = place.id === conceptStations.program.id ? conceptStations.program : conceptStations.pack
            return (
              <ConceptTile
                key={place.id}
                place={place}
                name={concept.name}
                icon={place.id === conceptStations.program.id ? CodeXmlIcon : PackageIcon}
              />
            )
          }
          const entry = page.machines.find((one) => one.show.machine.machine === place.id)!
          const here = orders.filter((one) => one.at.machine === place.id && (one.state === "running" || one.state === "interrupted"))
          return (
            <MachineTile
              key={place.id}
              place={place}
              icon={iconOf(place.id)}
              show={entry.show}
              asOf={page.asOf}
              lens={lens}
              queue={page.jobs[place.id]?.orders ? waiting(page.jobs[place.id]).length : null}
              selected={!order && machine === place.id}
              orderHere={order?.at.machine === place.id ? order : null}
              dim={order !== null && !path.includes(place.id)}
              here={here}
              chosen={order?.key ?? null}
              onOpen={() => onMachine(place.id)}
              onOrder={onOrder}
            />
          )
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

/** A step of every order that publishes nothing yet: it stands on the map, without values. */
function ConceptTile({ place, name, icon: Icon }: { place: Place; name: string; icon: LucideIcon }) {
  return (
    <div className="absolute" style={{ left: place.x, top: place.y, width: TILE_WIDTH }}>
      <Item
        variant="outline"
        size="sm"
        className={cn("content-start gap-1.5 border-dashed bg-muted/40 pl-4", stripe["no-data"])}
        style={{ height: TILE_HEIGHT }}
      >
        <ItemHeader>
          <ItemMedia variant="icon">
            <Icon />
          </ItemMedia>
          <ItemTitle className="mr-auto block min-w-0 truncate">{name}</ItemTitle>
        </ItemHeader>
        <ItemContent className="gap-0.5">
          <span className="flex items-center gap-1.5 text-xs">
            <StateSymbol state="no-data" />
            No source yet
          </span>
          <span className="text-xs text-muted-foreground">Publishes nothing to the stack.</span>
        </ItemContent>
      </Item>
    </div>
  )
}

function MachineTile({
  place,
  icon: Icon,
  show,
  asOf,
  lens,
  queue,
  selected,
  orderHere,
  dim,
  here,
  chosen,
  onOpen,
  onOrder,
}: {
  place: Place
  icon: LucideIcon
  show: MachineShow
  asOf: string
  lens: Lens
  queue: number | null
  selected: boolean
  orderHere: Order | null
  dim: boolean
  here: ReadonlyArray<Order>
  chosen: string | null
  onOpen: () => void
  onOrder: (key: string) => void
}) {
  const { machine } = show
  const state = stateOf(machine, asOf)
  const share = utilisation(show)
  const big = lens === "load" ? percent(share) : queue === null ? "–" : String(queue)
  const bigLabel = lens === "load" ? "producing" : "job orders waiting"
  const job = machine.jobOrder
  const small = job ? `${job.jobOrderId} · ${job.producedQuantity ?? "?"} of ${job.runsPlanned ?? "?"}` : "No job order"
  const badge = orderHere ? orderBadge[orderHere.state] : null
  const maker = makerOf(machine.identity.manufacturer)
  // The ring stands where the order is or waits; one that is through or held up keeps its badge only.
  const ring = selected || orderHere?.state === "running" || orderHere?.state === "waiting"
  // One order as a marker, the chosen one if it is here; the rest as "+N".
  const shown = here.find((one) => one.key === chosen) ?? here[0]
  const more = Math.max(0, here.length - (shown ? 1 : 0)) + (queue ?? 0)

  return (
    <div className="absolute flex flex-col gap-1.5" style={{ left: place.x, top: place.y, width: TILE_WIDTH }}>
      {badge && (
        <Badge variant={badge.variant} className="absolute -top-2.5 right-2 z-10">
          {badge.label}
        </Badge>
      )}
      <Item
        variant="outline"
        size="sm"
        render={<button type="button" onClick={onOpen} />}
        className={cn(
          "cursor-pointer content-start gap-1.5 bg-card pl-4 text-left hover:bg-muted/50",
          stripe[state],
          state === "alarm" && "border-destructive",
          ring && "border-primary ring-3 ring-primary/20",
          dim && "opacity-30",
        )}
        style={{ height: TILE_HEIGHT }}
      >
        <ItemHeader>
          <ItemMedia variant="icon">
            <Icon />
          </ItemMedia>
          <ItemTitle className="mr-auto block min-w-0 truncate">{titleOf(machine)}</ItemTitle>
        </ItemHeader>
        <ItemContent className="gap-0.5">
          <span className="flex items-center gap-1.5 text-xs">
            <StateSymbol state={state} />
            <span className="mr-auto truncate">{stateLabel[state]}</span>
            {maker?.logo ? (
              <img src={maker.logo} alt={maker.name} title={maker.name} className="w-auto shrink-0" style={{ height: maker.height }} />
            ) : maker ? (
              <span
                className="max-w-16 shrink-0 truncate text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
                title={maker.name}
              >
                {maker.name}
              </span>
            ) : null}
          </span>
          <span className="flex items-baseline gap-1">
            <span className="text-xl font-semibold tabular-nums">{big}</span>
            <span className="truncate text-xs text-muted-foreground">{bigLabel}</span>
          </span>
        </ItemContent>
        <ItemFooter className="flex-col items-stretch gap-1">
          <Meter value={Math.round((share ?? 0) * 100)} aria-label="Producing" />
          <span className="truncate text-xs text-muted-foreground tabular-nums">{small}</span>
        </ItemFooter>
      </Item>
      <div className="flex gap-1">
        {shown && (
          <Button
            variant={chosen === shown.key ? "default" : "outline"}
            size="xs"
            className={cn(
              "max-w-24 truncate rounded-full",
              shown.state === "interrupted" && chosen !== shown.key && "border-destructive/50 text-destructive",
              chosen && chosen !== shown.key && "opacity-45",
            )}
            title={`${shown.label} · ${shown.jobName ?? ""}`}
            aria-label={`Open order ${shown.label}`}
            onClick={() => onOrder(shown.key)}
          >
            {shown.label}
          </Button>
        )}
        {more > 0 && (
          <Button
            variant="secondary"
            size="xs"
            className={cn("rounded-full", chosen && "opacity-45")}
            title={`${more} more job orders at ${titleOf(machine)}`}
            aria-label={`${more} more job orders at ${titleOf(machine)}`}
            onClick={onOpen}
          >
            +{more}
          </Button>
        )}
      </div>
    </div>
  )
}
