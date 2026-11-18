import type { ReactNode } from "react"

import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { clock } from "../machine/format.ts"
import { labelOf } from "../machine/in-words.ts"
import type { MachineMeasurements, MeasurementList } from "./contract.ts"
import { measuredValue, quantityLabel } from "./words.ts"

/**
 * The measurement card of one machine: the newest value of each physical quantity, in the unit it
 * was published in. A value that is not current says since when it is known. It draws a part of
 * the result of `genui_measurement_list` and computes nothing but the wording.
 */
export function MeasurementCard({ machine, asOf }: { machine: MachineMeasurements; asOf: string }) {
  const { measurements } = machine
  const stale = measurements.filter((one) => one.stale).length
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">{labelOf(machine.machine)}</CardTitle>
        {stale > 0 && (
          <CardAction>
            <Badge variant="outline">{stale === measurements.length ? "No current values" : `${stale} not current`}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
          {measurements.map((one) => (
            <Row key={one.quantity} label={quantityLabel[one.quantity]}>
              <span className={one.stale ? "text-muted-foreground tabular-nums" : "tabular-nums"}>{measuredValue(one)}</span>
              {one.stale && one.at && (
                <span className="block text-xs text-muted-foreground">last measured at {clock(one.at)}</span>
              )}
            </Row>
          ))}
        </dl>
      </CardContent>
      <CardFooter className="block text-xs break-words text-muted-foreground">
        Read at {clock(asOf)} from {measurements.map((one) => one.topic).join(", ")}
      </CardFooter>
    </Card>
  )
}

/** The measurement cards of every machine in a list, side by side where there is room. */
export function MeasurementCards({ asOf, machines }: MeasurementList) {
  if (machines.length === 0) {
    return <p className="text-sm text-muted-foreground">No machine published a value in the last 24 hours.</p>
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3">
      {machines.map((machine) => (
        <MeasurementCard key={machine.machine} machine={machine} asOf={asOf} />
      ))}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </>
  )
}
