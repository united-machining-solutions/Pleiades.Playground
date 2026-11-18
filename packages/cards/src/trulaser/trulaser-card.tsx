import type { ReactNode } from "react"

import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { clock } from "../machine/format.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import { ConditionGuide } from "./condition-guide.tsx"
import type { ReadSeries } from "./condition-guide.tsx"
import type { Signal, TrulaserShow } from "./contract.ts"
import { Timelines } from "./timelines.tsx"
import type { Timeline } from "./timelines.tsx"
import { signalText, trulaserTitle } from "./words.ts"

/**
 * The TruLaser card: what a TRUMPF laser cutting machine does now and why, how its states, runs and
 * automation devices played together over the last hours, and the state of its media. It draws the
 * result of `genui_trulaser_show` and computes nothing but the wording.
 *
 * The timelines and the charts of the condition guide are not part of that result. Whoever draws the
 * card asks for the timelines (`genui_trulaser_timeline`) and hands them in as they arrive, and gives
 * the card a way to read the values of a tile (`genui_trulaser_series`). The card stands without them.
 */
export function TrulaserCard({
  values,
  timeline,
  hours,
  onHours,
  readSeries,
}: {
  values: TrulaserShow
  timeline: Timeline
  hours: number
  onHours?: (hours: number) => void
  readSeries?: ReadSeries
}) {
  const { signals, sequence, unitsInMalfunction, devices, conditionGuide, asOf } = values
  const broken = unitsInMalfunction.length > 0
  const collided = signals.collisionState.value === "CollisionDetected"

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm" className={broken ? "ring-2 ring-destructive" : undefined}>
        <CardHeader>
          <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">{trulaserTitle(values)}</CardTitle>
          <CardDescription>{values.machine}</CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-1.5">
            {broken && (
              <Badge variant="destructive">
                <StateSymbol state="alarm" />
                {unitsInMalfunction.length} {unitsInMalfunction.length === 1 ? "unit" : "units"} in malfunction
              </Badge>
            )}
            <Badge variant="outline">{signalText(signals.itemState)}</Badge>
            <Badge variant="outline">{signalText(signals.operationMode)}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent className="gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 sm:grid-cols-[auto_1fr_auto_1fr]">
            <Row label="Change cause">
              <span className="font-medium">{signalText(signals.changeCauseSignal)}</span>
              {signals.changeCauseSignal.at && (
                <span className="text-muted-foreground tabular-nums"> · since {clock(signals.changeCauseSignal.at)}</span>
              )}
            </Row>
            <Row label="Sequence">
              {sequence ? (
                <>
                  {sequence.sequenceState}
                  {sequence.blockingCause && (
                    <Badge variant="secondary" className="ml-1.5">
                      blocked: {sequence.blockingCause}
                    </Badge>
                  )}
                </>
              ) : (
                signalText(signals.changeCauseValue)
              )}
            </Row>
            <Row label="Units in malfunction">
              {broken ? (
                <span className="font-medium text-destructive">{unitsInMalfunction.join(", ")}</span>
              ) : (
                <span className="text-muted-foreground">none</span>
              )}
            </Row>
            <Row label="Laser">{signals.laserOn.value === null ? "–" : signals.laserOn.value ? "on" : "off"}</Row>
          </dl>
          <Timelines timeline={timeline} hours={hours} onHours={onHours} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="font-semibold">Production plan</CardTitle>
            <CardAction>
              <Badge variant="outline">{signalText(signals.productionPlanRunState)}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Ids rows={[["Plan id", signals.productionPlanRunId]]} />
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="font-semibold">Program run</CardTitle>
            <CardDescription>{signalText(signals.programName)}</CardDescription>
            <CardAction>
              <Badge variant="outline">{signalText(signals.programRunState)}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Ids
              rows={[
                ["Run id", signals.programRunId],
                ["Plan id", signals.programRunPlanId],
              ]}
            />
          </CardContent>
        </Card>
        <Card size="sm" className={collided ? "ring-2 ring-destructive" : undefined}>
          <CardHeader>
            <CardTitle className="font-semibold">Collision detection</CardTitle>
            <CardDescription>{signalText(signals.collisionProgram)}</CardDescription>
            <CardAction>
              <Badge variant={collided ? "destructive" : "outline"}>
                {collided && <StateSymbol state="alarm" />}
                {signalText(signals.collisionState)}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <Row label="Nozzle collision stop">{signalText(signals.nozzleCollisionStop)}</Row>
              <Row label="NC block before">
                <code>{signalText(signals.collisionBlockPrevious)}</code>
              </Row>
              <Row label="NC block">
                <code className="font-semibold">{signalText(signals.collisionBlockCurrent)}</code>
              </Row>
              <Row label="NC block after">
                <code>{signalText(signals.collisionBlockNext)}</code>
              </Row>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="font-semibold">Automation device requests</CardTitle>
            <CardAction>
              <Badge variant="outline">
                {signals.deviceRequestActive.value === true ? "Request active" : "No active request"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Error code</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((one) => (
                  <TableRow key={one.index}>
                    <TableCell className="font-medium">{signalText(one.type)}</TableCell>
                    <TableCell>{signalText(one.state)}</TableCell>
                    <TableCell className="font-mono">{signalText(one.errorCode)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="font-semibold">Laser technology</CardTitle>
            <CardAction>
              <Badge variant="outline">{signalText(signals.technologyStatus)}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <Row label="Parameter set">
                <code className="break-all">{signalText(signals.technologyKey)}</code>
              </Row>
              <Row label="Based on">
                <code className="break-all">{signalText(signals.technologyParent)}</code>
              </Row>
              <Row label="Nozzle">{signalText(signals.technologyNozzle)}</Row>
              <Row label="Status">{signalText(signals.technologySetStatus)}</Row>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="font-semibold">Condition guide</CardTitle>
          {readSeries && <CardDescription>Open a tile for its values over time.</CardDescription>}
        </CardHeader>
        <CardContent>
          <ConditionGuide tiles={conditionGuide} hours={hours} readSeries={readSeries} />
        </CardContent>
        <CardFooter className="block text-xs break-words text-muted-foreground">
          Read at {clock(asOf)} from machines/{values.machine}/oem/Dalle and oem/Mos/Laser1
        </CardFooter>
      </Card>
    </div>
  )
}

function Ids({ rows }: { rows: ReadonlyArray<[string, Signal]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
      {rows.map(([label, signal]) => (
        <Row key={label} label={label}>
          <code className="break-all">{signalText(signal)}</code>
        </Row>
      ))}
    </dl>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  )
}
