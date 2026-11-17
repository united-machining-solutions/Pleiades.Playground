import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"

import { clock } from "../machine/format.ts"
import { stateLabel } from "../machine/state.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import type { ShopfloorShow } from "./contract.ts"
import { HallPlan } from "./hall-plan.tsx"

/**
 * The shop floor card: the plan of the hall with every machine at its place. A machine that runs is
 * greyed out; a machine that does not run stands out, and over it stands why. It draws the result of
 * `genui_shopfloor_show` and computes nothing but the wording and the drawing.
 */
export function ShopfloorCard({ asOf, hall, machines, notRunning }: ShopfloorShow) {
  const reasonTopics = [...new Set(machines.flatMap((one) => (one.reason ? [one.reason.topic] : [])))]
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">{hall.name}</CardTitle>
        <CardDescription>
          {machines.length === 0
            ? "No machines"
            : notRunning === 0
              ? `All ${machines.length} machines run`
              : `${notRunning} of ${machines.length} ${machines.length === 1 ? "machine does" : "machines do"} not run`}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">
            <StateSymbol state={notRunning === 0 ? "running" : "alarm"} />
            {machines.length - notRunning} running
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {machines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No machine published a value in the last 24 hours.</p>
        ) : (
          <>
            <HallPlan hall={hall} machines={machines} />
            {/* The plan in words, for a reader that does not see it. */}
            <ul className="sr-only">
              {machines.map(({ machine, state, reason, program }) => (
                <li key={machine}>
                  {machine}: {stateLabel[state]}
                  {reason ? `, ${reason.message}` : program ? `, ${program}` : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
      <CardFooter className="block text-xs break-words text-muted-foreground">
        Read at {clock(asOf)}. State from machines/{"{SerialNumber}"}/umati: Connection/State, Connection/Heartbeat,
        State/MachineryItemState, State/MachineryOperationMode
        {reasonTopics.length > 0 && `. Reasons from ${reasonTopics.join(", ")}`}. Plan: {hall.source}
      </CardFooter>
    </Card>
  )
}
