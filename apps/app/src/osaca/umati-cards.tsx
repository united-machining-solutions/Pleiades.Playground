import { clock } from "@pleiades/cards/machine/format.ts"
import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { BellOffIcon, TriangleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"

import type { Json, ModelValue } from "./contract.ts"

// The values of the umati data model the cell publishes below `<root>/umati`. The cards only write the values
// out: units are turned into the ones people read (kW, bar, hours, l/min), nothing is added up.

export type Umati = Record<string, ModelValue>
type Struct = { [key: string]: Json }

/** The value of one path, e.g. `State/Status`; undefined while it has not come. */
const valueOf = (umati: Umati, path: string): Json | undefined => umati[path]?.value
const textOf = (umati: Umati, path: string): string | undefined => str(valueOf(umati, path))
const numberOf = (umati: Umati, path: string): number | undefined => num(valueOf(umati, path))
const listOf = (umati: Umati, path: string): Struct[] => {
  const value = valueOf(umati, path)
  return Array.isArray(value) ? value.filter((one): one is Struct => one !== null && typeof one === "object" && !Array.isArray(one)) : []
}
const structOf = (umati: Umati, path: string): Struct | undefined => {
  const value = valueOf(umati, path)
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined
}
const str = (value: Json | undefined): string | undefined => (typeof value === "string" ? value : undefined)
const num = (value: Json | undefined): number | undefined => (typeof value === "number" ? value : undefined)

/** A number for people, with grouping and a fixed number of decimals. */
export function figure(value: number | undefined, digits = 1, unit = ""): string {
  if (value === undefined) return "–"
  const text = new Intl.NumberFormat("en", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
  return unit ? `${text} ${unit}` : text
}
/** A fraction (1.0 = 100 %) as a percentage. */
const percent = (value: number | undefined) => (value === undefined ? "–" : `${Math.round(value * 100)} %`)
/** Watt to kilowatt, watt-hour to kilowatt-hour, pascal to bar, cubic metre per second to litre per minute. */
const kilo = (value: number | undefined) => (value === undefined ? undefined : value / 1000)

/** States that mean "something is wrong" or "all is well", after the enums of the data model. */
const BAD = new Set(["OutOfService", "Aborted", "CommunicationFault", "Failure", "Unsuccessful"])
const GOOD = new Set(["Executing", "Running", "Active", "Ended", "Successful"])
export function StateBadge({ state }: { state: string | undefined }) {
  if (state === undefined) return <span className="text-muted-foreground">–</span>
  return <Badge variant={BAD.has(state) ? "destructive" : GOOD.has(state) ? "default" : "secondary"}>{state}</Badge>
}

// ------------------------------------------------------------------------------------------- key figures

/** One key figure: what it is, the figure, and a line under it. */
function Tile({ label, value, line, action }: { label: string; value: ReactNode; line?: ReactNode; action?: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="truncate text-2xl font-semibold tabular-nums group-data-[size=sm]/card:text-2xl">{value}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="-mt-2 truncate text-sm text-muted-foreground">{line ?? " "}</CardContent>
    </Card>
  )
}

/** The figures a person looks at first: state, program, override, power, air, parts. */
export function KeyFigures({ umati }: { umati: Umati }) {
  const status = structOf(umati, "State/Status")
  const run = structOf(umati, "WorkMasterMonitoring/ProgramExecution")
  const lit = listOf(umati, "Stacklight/StackElement").filter((lamp) => lamp.SignalOn === true)
  const rotating = valueOf(umati, "Spindle/1/IsRotating")
  const flow = numberOf(umati, "Consumption/CompressedAir/Main/VolumeFlowRate")
  const pressure = numberOf(umati, "Consumption/CompressedAir/Main/Pressure")
  const powerOn = numberOf(umati, "OperationCounters/PowerOnDuration")
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Tile
        label="Machine"
        value={str(status?.MachineryItemState) ?? "–"}
        line={[str(status?.MachineryOperationMode), lit.length > 0 && `light ${lit.map((lamp) => str(lamp.SignalColor)?.toLowerCase()).join(", ")}`]
          .filter(Boolean)
          .join(" · ")}
        action={lit.some((lamp) => lamp.SignalColor === "Red") && <Badge variant="destructive">Fault</Badge>}
      />
      <Tile
        label="Program"
        value={str(run?.State) ?? "–"}
        line={[str(run?.ActiveWorkMaster), str(run?.JobOrderID) && `job ${str(run?.JobOrderID)}`].filter(Boolean).join(" · ")}
      />
      <Tile
        label="Feed override"
        value={percent(numberOf(umati, "State/FeedOverride"))}
        line={`Spindle ${rotating === true ? "rotating" : rotating === false ? "stopped" : "–"}`}
      />
      <Tile
        label="Power"
        value={figure(kilo(numberOf(umati, "Consumption/Electricity/Main/AcActivePowerTotal")), 1, "kW")}
        line={`${figure(kilo(numberOf(umati, "Consumption/Electricity/Main/AcActiveEnergyTotalImportHp")), 0, "kWh")} in total`}
      />
      <Tile
        label="Compressed air"
        value={figure(flow === undefined ? undefined : flow * 60_000, 0, "l/min")}
        line={figure(pressure === undefined ? undefined : pressure / 100_000, 2, "bar")}
      />
      <Tile
        label="Parts in lifetime"
        value={figure(numberOf(umati, "OperationCounters/PartsProducedInLifetime"), 0)}
        line={`${figure(powerOn === undefined ? undefined : powerOn / 3600, 0, "h")} powered on`}
      />
    </div>
  )
}

// ------------------------------------------------------------------------------------------- channels and alerts

export function ChannelsCard({ umati }: { umati: Umati }) {
  const channels = [...new Set(Object.keys(umati).flatMap((path) => /^Channel\/(\d+)\//.exec(path)?.[1] ?? []))]
  if (channels.length === 0) return null
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>NC channels</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Feed</TableHead>
              <TableHead className="text-right">State</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.map((n) => (
              <TableRow key={n}>
                <TableCell className="font-medium">
                  {n} · {textOf(umati, `Channel/${n}/Name`) ?? "–"}
                </TableCell>
                <TableCell className="text-muted-foreground">{textOf(umati, `Channel/${n}/ChannelMode`) ?? "–"}</TableCell>
                <TableCell className="text-right tabular-nums">{percent(numberOf(umati, `Channel/${n}/FeedOverride`))}</TableCell>
                <TableCell className="text-right">
                  <StateBadge state={textOf(umati, `Channel/${n}/ChannelState`)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export function AlertsCard({ umati }: { umati: Umati }) {
  const alerts = listOf(umati, "Notification/ActiveAlerts")
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Active alerts</CardTitle>
        <CardAction>
          <Badge variant={alerts.length > 0 ? "destructive" : "secondary"}>{alerts.length}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ItemGroup>
          {alerts.length === 0 ? (
            <Item size="xs" variant="muted">
              <ItemMedia variant="icon">
                <BellOffIcon />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>No active alerts</ItemTitle>
              </ItemContent>
            </Item>
          ) : (
            alerts.map((alert) => (
              <Item key={String(alert.Id)} size="xs" variant="muted">
                <ItemMedia variant="icon">
                  <TriangleAlertIcon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{str(alert.Message)}</ItemTitle>
                  <ItemDescription>
                    {[str(alert.ErrorCode), str(alert.SourceName), str(alert.Time) && clock(str(alert.Time)!)].filter(Boolean).join(" · ")}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))
          )}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------------------------------------- job orders

export function JobsCard({ umati }: { umati: Umati }) {
  const orders = listOf(umati, "JobMonitoring/JobOrders")
  if (orders.length === 0) return null
  // The result of an order is the entry of the result list with the same JobOrderID.
  const results = new Map(listOf(umati, "JobMonitoring/JobOrderResults").map((one) => [str(one.JobOrderID), one]))
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Job orders</CardTitle>
        <CardDescription>As the cell lists them, with their results.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Runs</TableHead>
              <TableHead className="text-right">Good / produced</TableHead>
              <TableHead className="text-right">Since</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => {
              const result = results.get(str(order.JobOrderID))
              const since = str(order.StateSince)
              return (
                <TableRow key={str(order.JobOrderID)}>
                  <TableCell className="font-medium">{str(order.JobOrderID)}</TableCell>
                  <TableCell>{str(order.JobName)}</TableCell>
                  <TableCell>
                    <StateBadge state={str(order.State)} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {result ? num(result.RunsCompleted) ?? 0 : "–"} / {num(order.RunsPlanned) ?? "–"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {result ? `${num(result.GoodQuantity) ?? 0} / ${num(result.ProducedQuantity) ?? 0}` : "–"}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">{since ? clock(since) : "–"}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------------------------------------- the machine

export function MachineCard({ umati }: { umati: Umati }) {
  const text = (name: string) => textOf(umati, `Identification/${name}`)
  const hours = (name: string) => {
    const seconds = numberOf(umati, `OperationCounters/${name}`)
    return figure(seconds === undefined ? undefined : seconds / 3600, 0, "h")
  }
  const built = [numberOf(umati, "Identification/MonthOfConstruction"), numberOf(umati, "Identification/YearOfConstruction")]
    .filter((one) => one !== undefined)
    .join("/")
  const facts: Array<[string, string | undefined]> = [
    ["Device class", text("DeviceClass")],
    ["Name", text("ComponentName")],
    ["Asset", text("AssetId")],
    ["Location", text("Location")],
    ["Built", built ? `${built}, revision ${text("HardwareRevision") ?? "–"}` : undefined],
    ["Powered on", hours("PowerOnDuration")],
    ["Operating", hours("OperationDuration")],
  ]
  const software = listOf(umati, "Components/Software")
  if (!text("Manufacturer") && software.length === 0) return null
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{[text("Manufacturer"), text("Model")].filter(Boolean).join(" · ") || "Machine"}</CardTitle>
        <CardDescription>Serial number {text("SerialNumber") ?? "–"}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <Table>
          <TableBody>
            {facts.map(([label, value]) => (
              <TableRow key={label}>
                <TableCell className="text-muted-foreground">{label}</TableCell>
                <TableCell className="text-right tabular-nums">{value ?? "–"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {software.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Software</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead className="text-right">Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {software.map((one) => (
                <TableRow key={`${str(one.Manufacturer)}/${str(one.ComponentName)}`}>
                  <TableCell>{str(one.ComponentName)}</TableCell>
                  <TableCell className="text-muted-foreground">{str(one.Manufacturer)}</TableCell>
                  <TableCell className="text-right tabular-nums">{str(one.SoftwareRevision)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
