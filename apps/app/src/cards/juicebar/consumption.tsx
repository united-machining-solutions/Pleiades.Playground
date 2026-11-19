import { useState } from "react"

import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Meter } from "@pleiades/ui/components/meter"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"

import { inUseOrder, shortName } from "./results.ts"
import type { Consumption, IngredientUse, UseOrder } from "./results.ts"

// The use of the juices, after the energy card (packages/cards/src/energy/): each ingredient on a pump with
// a meter against the most used, its drinks in the last hours and since the start, and the least used one
// marked, which is the one to take off a pump first. It draws the result of juicebar_consumption_get, which
// counts, orders and names the least used one; this card only words it. chat.tsx lists it.

const USE_ORDERS: ReadonlyArray<UseOrder> = ["start", "hours"]

/** The use of the ingredients on the pumps of the juice bar. */
export function ConsumptionCard({ used }: { used: Consumption }) {
  const [order, setOrder] = useState<UseOrder>("start")
  const last = `${used.hours} h`
  // The meters compare the drinks since the start with the ingredient used most, so the order does not change them.
  const most = Math.max(0, ...used.ingredients.map((one) => one.drinksSinceStart ?? 0))
  const label: Record<UseOrder, string> = { start: "Since start", hours: `Last ${last}` }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">Juices used</CardTitle>
        <CardDescription>Sold drinks with each juice on a pump, in the last {last} and since the start</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {used.ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No juice is on a pump of the juice bar.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-xs text-muted-foreground">Order by</span>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                aria-label="Order of the juices"
                value={[order]}
                onValueChange={(chosen) => {
                  const next = USE_ORDERS.find((one) => one === chosen[0])
                  if (next !== undefined && next !== order) setOrder(next)
                }}
              >
                {USE_ORDERS.map((one) => (
                  <ToggleGroupItem key={one} value={one}>
                    {label[one]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-full">Juice</TableHead>
                  <TableHead className="text-right">{last}</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody key={order} className="motion-safe:animate-card-fade-in">
                {inUseOrder(used.ingredients, order).map((one) => (
                  <UseRow key={one.componentId} one={one} most={most} least={one.componentId === used.leastUsedId} />
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">Drinks over all machines of the marketplace, not millilitres.</p>
      </CardFooter>
    </Card>
  )
}

/** A count of drinks, or that it is not known: the report of the marketplace names only its ten most used. */
function Drinks({ count }: { count: number | null | undefined }) {
  if (count === null || count === undefined) return <span className="text-muted-foreground">not known</span>
  return <>{count}</>
}

/** The pumps an ingredient is on, and whether the bottle of one of them runs low. */
function pumpsSaid(one: IngredientUse): string {
  const pumps = one.pumps.length === 1 ? `Pump ${one.pumps[0]}` : `Pumps ${one.pumps.join(" and ")}`
  return one.runsLow === true ? `${pumps} · runs low` : pumps
}

/** One ingredient: its colour, its name and pumps, a meter against the most used, and its counts. */
function UseRow({ one, most, least }: { one: IngredientUse; most: number; least: boolean }) {
  const name = shortName({ id: one.componentId, name: one.name })
  return (
    <TableRow>
      <TableCell className="whitespace-normal">
        <div className="flex items-center gap-2 font-medium">
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/25"
            style={{ backgroundColor: one.color ?? "var(--muted)" }}
          />
          {name}
          {least && <Badge variant="secondary">Least used</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{pumpsSaid(one)}</p>
        {most > 0 && one.drinksSinceStart !== null && one.drinksSinceStart !== undefined && (
          <Meter
            aria-label={`${name}: ${one.drinksSinceStart} drinks since the start, against the juice used most`}
            value={one.drinksSinceStart}
            min={0}
            max={most}
            className="mt-1.5"
          />
        )}
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">
        <Drinks count={one.drinksInHours} />
      </TableCell>
      <TableCell className="text-right align-top tabular-nums">
        <Drinks count={one.drinksSinceStart} />
      </TableCell>
    </TableRow>
  )
}
