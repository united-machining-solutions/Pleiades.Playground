import type { State } from "@pleiades/cards/machine/contract.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@pleiades/ui/components/tabs"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { createFileRoute } from "@tanstack/react-router"
import { MessageSquareWarningIcon } from "lucide-react"
import { useState } from "react"

import { instantOf, instants, parts, stationById } from "@/showcases/where-is-my-job/data.ts"
import type { Instant } from "@/showcases/where-is-my-job/data.ts"
import { FloorMap } from "@/showcases/where-is-my-job/floor-map.tsx"
import type { Lens } from "@/showcases/where-is-my-job/floor-map.tsx"
import { FloorPanel, MachinePanel, PartPanel, PartsTable } from "@/showcases/where-is-my-job/panels.tsx"

/**
 * Where is My Job? A basis for discussion, not a page of the stack: it reads nothing from the
 * backend, and every value comes from the made-up shop floor in
 * `src/showcases/where-is-my-job/data.ts`. It shows the shop floor from above, one machine, and one
 * part on its way, as three perspectives of one picture. The chat does not know it.
 *
 * It is a showcase: the page is only in a build with the showcases (APP_SHOWCASES), and the folder
 * `(showcases)` adds nothing to its address. It names no entry in the sidebar either, so a demo does
 * not show made-up data next to the pages of the stack: it is reached by its address,
 * /where-is-my-job, and the breadcrumb calls it by its crumb.
 */
export const Route = createFileRoute("/(showcases)/where-is-my-job")({
  staticData: { crumb: "Where is My Job?" },
  component: WhereIsMyJob,
})

type View = "floor" | "machine" | "part"

const legendStates: ReadonlyArray<State> = ["running", "setup", "stopped", "alarm"]

function WhereIsMyJob() {
  const [instant, setInstant] = useState<Instant>("now")
  const [lens, setLens] = useState<Lens>("load")
  const [machine, setMachine] = useState<string | null>(null)
  const [partId, setPartId] = useState<string | null>(null)
  // The part a person came from when they opened a machine from its path.
  const [backTo, setBackTo] = useState<string | null>(null)

  const part = parts.find((one) => one.id === partId) ?? null
  const station = machine ? (stationById[machine] ?? null) : null
  const view: View = part ? "part" : station ? "machine" : "floor"

  const openMachine = (id: string, from: string | null = null) => {
    setMachine(id)
    setPartId(null)
    setBackTo(from)
  }
  // A part keeps the open machine only when it was opened from that machine, so tab 2 always names
  // a machine that belongs to the part.
  const openPart = (id: string, fromMachine = false) => {
    if (!fromMachine) setMachine(null)
    setPartId(id)
    setBackTo(null)
  }
  const openFloor = () => {
    setMachine(null)
    setPartId(null)
    setBackTo(null)
  }

  const clock = instantOf(instant)

  return (
    // Wider than the other pages: the map and the perspective it opens stand side by side.
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Where is My Job?</h1>
        <p className="text-sm text-muted-foreground">
          Concept · made-up data · {clock.name} {clock.clock}
        </p>
      </div>

      <Alert>
        <MessageSquareWarningIcon />
        <AlertTitle>For discussion only!</AlertTitle>
        <AlertDescription>
          One picture, three perspectives: the shop floor from above, each machine with what it did, does and will
          do, and each part on its way from programming to packing. Every value is made up; this page reads
          nothing from the stack.
        </AlertDescription>
      </Alert>

      <Tabs
        value={view}
        onValueChange={(value) => {
          if (value === "floor") openFloor()
          // From a part to its machine: the way back to the part stays.
          if (value === "machine") {
            setBackTo(partId)
            setPartId(null)
          }
        }}
        className="gap-6"
      >
        <TabsList aria-label="Perspective">
          <TabsTrigger value="floor">1 · Shop floor</TabsTrigger>
          <TabsTrigger value="machine" disabled={!station}>
            2 · {station ? station.name : "Machine"}
          </TabsTrigger>
          <TabsTrigger value="part" disabled={!part}>
            3 · {part ? part.id : "Part"}
          </TabsTrigger>
        </TabsList>

        {/* Side by side where there is room; the perspective drops below the map where there is not. */}
        <div className="flex flex-wrap items-start gap-6">
          {/* The map and the list of parts share the left column, so the list follows the map closely. */}
          <div className="flex min-w-0 flex-[999_1_780px] flex-col gap-6">
            <Card size="sm" className="min-w-0">
              <CardHeader>
                <CardTitle>The shop floor from above</CardTitle>
                <CardDescription>A tile opens its machine, a marker below it opens the part.</CardDescription>
                <CardAction className="flex flex-wrap justify-end gap-2">
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    spacing={0}
                    value={[instant]}
                    onValueChange={(value) => value[0] && setInstant(value[0] as Instant)}
                    aria-label="Time"
                  >
                    {instants.map((one) => (
                      <ToggleGroupItem key={one.id} value={one.id}>
                        {one.name} <span className="text-muted-foreground tabular-nums">{one.clock}</span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    spacing={0}
                    value={[lens]}
                    onValueChange={(value) => value[0] && setLens(value[0] as Lens)}
                    aria-label="Tiles show"
                  >
                    <ToggleGroupItem value="load">Utilisation</ToggleGroupItem>
                    <ToggleGroupItem value="queue">Queue</ToggleGroupItem>
                  </ToggleGroup>
                </CardAction>
              </CardHeader>
              <CardContent>
                <FloorMap
                  instant={instant}
                  lens={lens}
                  machine={machine}
                  part={part}
                  onMachine={(id) => openMachine(id, part?.id ?? null)}
                  onPart={(id) => openPart(id)}
                />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                  {legendStates.map((state) => (
                    <span key={state} className="flex items-center gap-1.5">
                      <StateSymbol state={state} />
                      {stateLabel[state]}
                    </span>
                  ))}
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="w-5 border-t-4 border-primary" />
                    path done
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="w-5 border-t-4 border-dashed border-primary" />
                    path planned
                  </span>
                  <span>Dashed tiles: planned values, not measured.</span>
                </div>
              </CardContent>
            </Card>

            <Card size="sm" className="min-w-0">
              <CardHeader>
                <CardTitle>Parts in circulation</CardTitle>
                <CardDescription>
                  {parts.length} parts tracked · delayed ones first · also on the map as markers below their machine
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PartsTable instant={instant} chosen={partId} onPart={(id) => openPart(id)} />
              </CardContent>
            </Card>
          </div>

          {/* One Card in each tab, so both keep their own composition. */}
          <TabsContent value="floor" className="min-w-0 flex-[1_1_300px]">
            <Card size="sm">
              <CardHeader>
                <CardTitle>1 · Shop floor</CardTitle>
                <CardDescription>What needs someone, at the time chosen above.</CardDescription>
              </CardHeader>
              <CardContent>
                <FloorPanel instant={instant} onMachine={(id) => openMachine(id)} onPart={(id) => openPart(id)} />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="machine" className="min-w-0 flex-[1_1_300px]">
            <Card size="sm">
              <CardHeader>
                <CardTitle>2 · Machine</CardTitle>
                <CardDescription>What it did, what it does, what it will do.</CardDescription>
              </CardHeader>
              <CardContent>
                {station && (
                  <MachinePanel
                    station={station}
                    instant={instant}
                    backTo={backTo}
                    onBack={() => backTo && openPart(backTo, true)}
                    onPart={(id) => openPart(id, true)}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="part" className="min-w-0 flex-[1_1_300px]">
            <Card size="sm">
              <CardHeader>
                <CardTitle>3 · Part</CardTitle>
                <CardDescription>Where it has been, where it is, where it goes.</CardDescription>
              </CardHeader>
              <CardContent>
                {part && (
                  <PartPanel
                    part={part}
                    instant={instant}
                    onMachine={(id) => openMachine(id, part.id)}
                    onPart={(id) => openPart(id)}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
