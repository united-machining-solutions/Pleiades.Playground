import { useCallback, useState } from "react"
import type { ReactNode } from "react"

import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@pleiades/ui/components/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { cn } from "@pleiades/ui/lib/utils"
import { clock } from "@pleiades/cards/machine/format.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { ConditionGuide } from "./condition-guide.tsx"
import type { ReadSeries } from "./condition-guide.tsx"
import { EXTENSION, signalValueFields } from "./contract.ts"
import type {
  Alert,
  Cockpit,
  TimelineView,
  TrulaserCollision,
  TrulaserConditions,
  TrulaserDevices,
  TrulaserJobOrder,
  TrulaserStatus,
  TrulaserTechnology,
} from "./contract.ts"
import { HoursChoice, Timelines } from "./timelines.tsx"
import type { ReadTimeline, Timeline } from "./timelines.tsx"
import { useRead } from "./use-read.ts"
import { signalText, trulaserTitle } from "./words.ts"

// The TruLaser cards. Each is named after the element of the umati data model it shows, or of the
// extension of TRUMPF where the model has none, and says which of the two it is. Each draws the result of
// one read and computes nothing but the wording.

/** Where the values of a card come from: the data model, or the extension of TRUMPF. */
type Origin = "umati" | "extension"

function OriginBadge({ origin }: { origin: Origin }) {
  return origin === "umati" ? (
    <Badge>umati 0.17.1</Badge>
  ) : (
    <Badge variant="outline" title={EXTENSION}>
      TRUMPF extension
    </Badge>
  )
}

/** The heading of a card: the name of the element it shows and where it comes from. */
function Heading({
  children,
  origin,
  description,
  action,
}: {
  children: ReactNode
  origin: Origin
  description?: ReactNode
  action?: ReactNode
}) {
  return (
    <CardHeader>
      <CardTitle className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold text-primary">
        {children}
        <OriginBadge origin={origin} />
      </CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
      {action && <CardAction className="flex flex-wrap justify-end gap-1.5">{action}</CardAction>}
    </CardHeader>
  )
}

/** A time of a value as a clock shows it; a dash for one that is empty or no time. */
function clockOf(instant: string | null | undefined): string {
  return instant && !Number.isNaN(Date.parse(instant)) ? clock(instant) : "–"
}

/** Where a card's values come from, and as of when. */
function Source({ asOf, children }: { asOf: string; children: ReactNode }) {
  return (
    <CardFooter className="block text-xs break-words text-muted-foreground">
      Read at {clockOf(asOf)} from {children}
    </CardFooter>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="font-mono text-[0.6875rem] font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function Rows({ rows }: { rows: ReadonlyArray<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-mono text-xs text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const mono = (text: string, strong = false) => (
  <code className={cn("font-mono text-xs break-all", strong && "font-semibold")}>{text}</code>
)

/** A state in a badge: a sign and a word, never colour alone. */
function StateBadge({ value }: { value: string }) {
  const running = ["Executing", "Running", "Active"].includes(value)
  const failed = ["OutOfService", "CollisionDetected", "Error", "Aborted"].includes(value)
  return (
    <Badge variant={failed ? "destructive" : "outline"} className="text-sm">
      {running && <StateSymbol state="running" />}
      {failed && <StateSymbol state="alarm" />}
      {value}
    </Badge>
  )
}

/** An alert that stands: its category after NE 107, where it comes from, its code and message. */
function AlertRow({ alert }: { alert: Alert }) {
  const failure = alert.Severity === "Failure"
  return (
    <TableRow className={failure ? "bg-destructive/10" : undefined}>
      <TableCell>
        <Badge variant={failure ? "destructive" : "outline"}>
          {failure ? <StateSymbol state="alarm" /> : <StateSymbol state="warning" />}
          {alert.Severity ?? "–"}
        </Badge>
      </TableCell>
      <TableCell className={cn("font-mono text-xs", failure && "font-semibold text-destructive")}>{alert.SourceName || "–"}</TableCell>
      <TableCell className="font-mono text-xs">{alert.ErrorCode}</TableCell>
      <TableCell className="text-xs whitespace-normal">{alert.Message}</TableCell>
      <TableCell className="text-xs tabular-nums">{clockOf(alert.Time)}</TableCell>
    </TableRow>
  )
}

/** State.Status with the ChangeCause of the extension, and Notification.ActiveAlerts. */
export function StatusCard({ status }: { status: TrulaserStatus }) {
  const { signals, activeAlerts } = status
  const failures = activeAlerts.filter((one) => one.Severity === "Failure")
  const cause = signals.changeCauseValue.value
  // A sequence as its SequenceState and BlockingCause, a message as its fields: see signalValueFields.
  const fields = signalValueFields(typeof cause === "string" ? cause : null)
  return (
    <Card size="sm" className={failures.length > 0 ? "ring-2 ring-destructive" : undefined}>
      <Heading
        origin="umati"
        action={signals.itemState.at && <span className="text-xs text-muted-foreground">since {clockOf(signals.itemState.at)}</span>}
      >
        State.Status
      </Heading>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-6">
          <Field label="Identification">
            <span className="text-xl font-semibold">{trulaserTitle(status)}</span>
            <span className="text-muted-foreground">
              {signalText(signals.manufacturer)} · Model {signalText(signals.model)}
            </span>
          </Field>
          <Field label="MachineryItemState · MachineryOperationMode">
            <div className="flex flex-wrap gap-2">
              <StateBadge value={signalText(signals.itemState)} />
              <Badge variant="secondary" className="text-sm">
                {signalText(signals.operationMode)}
              </Badge>
            </div>
          </Field>
          <Field label={`ChangeCause · ${EXTENSION}`}>
            <Rows
              rows={[
                ["SignalName", mono(signalText(signals.changeCauseSignal), true)],
                ...(fields
                  ? fields.map((one): [string, ReactNode] => [one.name, mono(one.value, one.name === "BlockingCause")])
                  : ([["SignalValue", mono(signalText(signals.changeCauseValue))]] as Array<[string, ReactNode]>)),
              ]}
            />
          </Field>
        </div>
        <Field label="Notification.ActiveAlerts">
          {!status.alertsComplete && (
            <span className="text-xs text-muted-foreground">
              The Events API had more alerts than it returned: some may be missing.
            </span>
          )}
          {activeAlerts.length === 0 ? (
            <span className="text-muted-foreground">No alert stands.</span>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>SourceName</TableHead>
                  <TableHead>ErrorCode</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAlerts.map((alert) => (
                  <AlertRow key={alert.Id} alert={alert} />
                ))}
              </TableBody>
            </Table>
          )}
        </Field>
      </CardContent>
      <Source asOf={status.asOf}>umati/State/Status, umati/Notification (Events API) and oem/Dalle/MachineState/ChangeCause</Source>
    </Card>
  )
}

/** The history of the status: State.Status, the requests of the automation and the alerts on one time axis. */
export function HistoryCard({
  timeline,
  hours,
  onHours,
}: {
  timeline: Timeline
  hours: number
  onHours?: (hours: number) => void
}) {
  return (
    <Card size="sm">
      <Heading
        origin="umati"
        description="Hover a span for its ChangeCause, an ErrorCode or the source of an alert"
        action={onHours ? <HoursChoice hours={hours} onHours={onHours} /> : <span className="text-xs">Last {hours} h</span>}
      >
        History
      </Heading>
      <CardContent>
        <Timelines timeline={timeline} />
      </CardContent>
    </Card>
  )
}

/** A button that opens the timelines of a view in a dialog, read when it opens and again for other hours. */
function OverTime({ title, view, readTimeline }: { title: string; view: TimelineView; readTimeline: ReadTimeline }) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(1)
  const read = useCallback(() => readTimeline(view, hours), [readTimeline, view, hours])
  const timeline: Timeline = useRead(open ? read : null)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>Open over time</DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{title} over time</DialogTitle>
          <DialogDescription>Hover a span for its ids and names.</DialogDescription>
        </DialogHeader>
        <HoursChoice hours={hours} onHours={setHours} />
        <Timelines timeline={timeline} />
      </DialogContent>
    </Dialog>
  )
}

/** JobMonitoring.JobOrders and the WorkMasterMonitoring.ProgramExecution in the job order; opened, both over time. */
export function JobOrderCard({ jobOrder, readTimeline }: { jobOrder: TrulaserJobOrder; readTimeline?: ReadTimeline }) {
  const job = jobOrder.jobOrder
  const { signals } = jobOrder
  return (
    <Card size="sm">
      <Heading origin="umati" action={readTimeline && <OverTime title="JobOrder" view="jobOrder" readTimeline={readTimeline} />}>
        JobOrder
      </Heading>
      <CardContent className="flex flex-col gap-4">
        <Field label="JobMonitoring.JobOrders">
          {job ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StateBadge value={job.State} />
                {job.StateSince && <span className="text-xs text-muted-foreground">since {clockOf(job.StateSince)}</span>}
              </div>
              <Rows
                rows={[
                  ["JobOrderID", mono(job.JobOrderID, true)],
                  ["JobName", job.JobName ?? "–"],
                  ["RunsCompleted", <span className="tabular-nums">{job.RunsCompleted ?? "–"}</span>],
                ]}
              />
            </>
          ) : (
            <span className="text-muted-foreground">No job order.</span>
          )}
        </Field>
        <Field label="WorkMasterMonitoring.ProgramExecution" className="rounded-lg bg-muted/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge value={signalText(signals.executionState)} />
            <span className="font-medium">{signalText(signals.activeWorkMaster)}</span>
          </div>
          <Rows
            rows={[
              ["ExecutionId", mono(signalText(signals.executionId))],
              ["ActiveWorkMaster", mono(signalText(signals.activeWorkMaster))],
              ["State", signalText(signals.executionState)],
              [
                "StartTime",
                <span className="tabular-nums">
                  {typeof signals.executionStartTime.value === "string" ? clockOf(signals.executionStartTime.value) : "–"}
                </span>,
              ],
              ["JobOrderID", mono(signalText(signals.executionJobOrderId))],
            ]}
          />
        </Field>
      </CardContent>
      <Source asOf={jobOrder.asOf}>umati/JobMonitoring (Events API) and umati/WorkMasterMonitoring/ProgramExecution</Source>
    </Card>
  )
}

/** AutomationDeviceRequestStates of the extension now; opened, over time. */
export function DevicesCard({ devices, readTimeline }: { devices: TrulaserDevices; readTimeline?: ReadTimeline }) {
  return (
    <Card size="sm">
      <Heading
        origin="extension"
        description={`DeviceRequestStatusActive ${signalText(devices.signals.deviceRequestActive)}`}
        action={readTimeline && <OverTime title="AutomationDeviceRequestStates" view="devices" readTimeline={readTimeline} />}
      >
        AutomationDeviceRequestStates
      </Heading>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>State</TableHead>
              <TableHead>ErrorCode</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {devices.devices.map((one) => (
              <TableRow key={one.index}>
                <TableCell className="font-medium">{signalText(one.type)}</TableCell>
                <TableCell>
                  <StateBadge value={signalText(one.state)} />
                </TableCell>
                <TableCell className="font-mono text-xs">{signalText(one.errorCode)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Source asOf={devices.asOf}>oem/Dalle/MachineState/AutomationDeviceRequestStates</Source>
    </Card>
  )
}

/** LaserTechnology of the extension: the parameter set the machine cuts with. */
export function TechnologyCard({ technology }: { technology: TrulaserTechnology }) {
  const { signals } = technology
  return (
    <Card size="sm">
      <Heading origin="extension" description={`DataProviderStatus ${signalText(signals.technologyStatus)}`}>
        LaserTechnology
      </Heading>
      <CardContent>
        <Rows
          rows={[
            ["KeyName", mono(signalText(signals.technologyKey))],
            ["Parent", mono(signalText(signals.technologyParent))],
            ["Nozzle", <span className="font-medium">{signalText(signals.technologyNozzle)}</span>],
            ["Status", signalText(signals.technologySetStatus)],
          ]}
        />
      </CardContent>
      <Source asOf={technology.asOf}>oem/Dalle/LaserTechnology</Source>
    </Card>
  )
}

/** CollisionData of the extension: the collision detection, and the NC blocks around its last detection. */
export function CollisionCard({ collision }: { collision: TrulaserCollision }) {
  const { signals } = collision
  const collided = signals.collisionState.value === "CollisionDetected"
  return (
    <Card size="sm" className={collided ? "ring-2 ring-destructive" : undefined}>
      <Heading origin="extension" action={<StateBadge value={signalText(signals.collisionState)} />}>
        CollisionData
      </Heading>
      <CardContent>
        <Rows
          rows={[
            ["ProgramName", <span className="font-medium">{signalText(signals.collisionProgram)}</span>],
            ["NozzleCollisionStop", signalText(signals.nozzleCollisionStop)],
            ["NcBlockGroup.Previous", mono(signalText(signals.collisionBlockPrevious))],
            ["NcBlockGroup.Current", mono(signalText(signals.collisionBlockCurrent), true)],
            ["NcBlockGroup.Next", mono(signalText(signals.collisionBlockNext))],
          ]}
        />
      </CardContent>
      <Source asOf={collision.asOf}>oem/Dalle/CollisionData</Source>
    </Card>
  )
}

/** ConditionGuide of the extension: the media of the machine; a tile opens its chart. */
export function ConditionsCard({ conditions, readSeries }: { conditions: TrulaserConditions; readSeries?: ReadSeries }) {
  return (
    <Card size="sm">
      <Heading origin="extension" description={readSeries ? "Open a tile for its values over time" : undefined}>
        ConditionGuide
      </Heading>
      <CardContent>
        <ConditionGuide tiles={conditions.tiles} readSeries={readSeries} />
      </CardContent>
      <Source asOf={conditions.asOf}>oem/Dalle/ConditionGuide</Source>
    </Card>
  )
}

/** Every card of a TruLaser: the status and its history across the width, then two by two. */
export function TrulaserCockpit({
  cockpit,
  timeline,
  hours,
  onHours,
  readTimeline,
  readSeries,
}: {
  cockpit: Cockpit
  timeline: Timeline
  hours: number
  onHours?: (hours: number) => void
  readTimeline?: ReadTimeline
  readSeries?: ReadSeries
}) {
  return (
    <div className="flex flex-col gap-4">
      <StatusCard status={cockpit.status} />
      <HistoryCard timeline={timeline} hours={hours} onHours={onHours} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-4">
        <JobOrderCard jobOrder={cockpit.jobOrder} readTimeline={readTimeline} />
        <DevicesCard devices={cockpit.devices} readTimeline={readTimeline} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-4">
        <TechnologyCard technology={cockpit.technology} />
        <CollisionCard collision={cockpit.collision} />
      </div>
      <ConditionsCard conditions={cockpit.conditions} readSeries={readSeries} />
    </div>
  )
}
