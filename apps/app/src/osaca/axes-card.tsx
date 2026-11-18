import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pleiades/ui/components/tabs"

import { isFault, written } from "./axes.ts"
import type { Drive } from "./axes.ts"
import type { OemValue } from "./contract.ts"

// The manufacturer values of the cell next to the 3D view: the robot, the milling machine and the rest of the
// cell, one tab each, so that the card keeps the height of the view.

/** A real-time figure of the PLC above this many microseconds is a counter that was never set (u64 max). */
const UNSET_MICROSECONDS = 1e12

/** The name of a drive for people, from what it moves. */
function nameOf({ kind, segment }: Drive): string {
  switch (kind.part) {
    case "robot":
      return `Joint ${kind.joint}`
    case "machine":
      return `Axis ${kind.axis}`
    case "rail":
      return "Rail X7"
    case "door":
      return "Door"
    default:
      return segment
  }
}

/** A drive state: quiet while all is well, a badge when the drive has a fault. */
function DriveState({ state }: { state: string | undefined }) {
  if (state === undefined) return <span className="text-muted-foreground">–</span>
  return isFault(state) ? <Badge variant="destructive">{state}</Badge> : <span className="text-muted-foreground">{state}</span>
}

function DriveTable({ drives }: { drives: Drive[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Axis</TableHead>
          <TableHead className="text-right">Position</TableHead>
          <TableHead className="text-right">State</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {drives.map((drive) => (
          <TableRow key={drive.segment}>
            <TableCell className="font-medium">{nameOf(drive)}</TableCell>
            <TableCell className="text-right tabular-nums">{drive.actual ? written(drive.kind, drive.actual) : "–"}</TableCell>
            <TableCell className="text-right">
              <DriveState state={drive.state} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

/** A value of the cell with the symbol of its unit, as it came. */
function valueText({ value, unit }: OemValue): string {
  if (value === null) return "–"
  if (typeof value === "boolean") return value ? "yes" : "no"
  if (typeof value === "string") return value
  if (unit === "microsecond") return value >= UNSET_MICROSECONDS ? "–" : `${value.toFixed(1)} µs`
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** The words for a path below `oem`: "Handling/GripperMkt/State" is "GripperMkt", a channel says its number. */
function labelOf(path: string): string {
  const [group, name, field] = path.split("/")
  if (group === "Channel") return `Channel ${name} · program line`
  if (group === "Realtime") return `${name} task · ${field?.toLowerCase()}`
  return name ?? path
}

function CellTable({ values }: { values: Record<string, OemValue> }) {
  // The minimum of a real-time figure is mostly a counter that was never set: the current and the maximum say it.
  const rows = Object.entries(values).filter(([path]) => /^(Handling|Channel)\/|^Realtime\/[^/]+\/(Current|Max)$/.test(path))
  return (
    <Table>
      <TableBody>
        {rows.map(([path, value]) => (
          <TableRow key={path}>
            <TableCell className="text-muted-foreground">{labelOf(path)}</TableCell>
            <TableCell className="text-right tabular-nums">{valueText(value)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function AxesCard({ drives, values }: { drives: Drive[]; values: Record<string, OemValue> }) {
  const robot = drives.filter((one) => one.kind.part === "robot" || one.kind.part === "rail")
  const machine = drives.filter((one) => one.kind.part === "machine" || one.kind.part === "door")
  const faults = (some: Drive[]) => some.filter((one) => isFault(one.state)).length
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle>Axes</CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <Tabs defaultValue="robot" className="h-full">
          <TabsList className="w-full">
            <TabsTrigger value="robot">
              Robot
              {faults(robot) > 0 && <Badge variant="destructive">{faults(robot)}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="machine">
              Machine
              {faults(machine) > 0 && <Badge variant="destructive">{faults(machine)}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="cell">Cell</TabsTrigger>
          </TabsList>
          <TabsContent value="robot" className="overflow-auto">
            <DriveTable drives={robot} />
          </TabsContent>
          <TabsContent value="machine" className="overflow-auto">
            <DriveTable drives={machine} />
          </TabsContent>
          <TabsContent value="cell" className="overflow-auto">
            <CellTable values={values} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
