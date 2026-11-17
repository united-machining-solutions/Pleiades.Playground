import type { State } from "@pleiades/cards/machine/contract.ts"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Button } from "@pleiades/ui/components/button"
import { Item, ItemContent, ItemFooter, ItemHeader, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"
import { Meter } from "@pleiades/ui/components/meter"
import { ScrollArea, ScrollBar } from "@pleiades/ui/components/scroll-area"
import { cn } from "cn"
import {
  CodeXmlIcon,
  CornerRightDownIcon,
  Disc3Icon,
  MartiniIcon,
  PackageIcon,
  StampIcon,
  ZapIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { MAP_HEIGHT, MAP_WIDTH, TILE_HEIGHT, TILE_WIDTH, edges, juiceLabel, parts, stations } from "./data.ts"
import type { Instant, Part, Station, StepKind } from "./data.ts"

export const stepIcon: Record<StepKind, LucideIcon> = {
  program: CodeXmlIcon,
  laser: ZapIcon,
  punch: StampIcon,
  grind: Disc3Icon,
  bend: CornerRightDownIcon,
  pack: PackageIcon,
  juice: MartiniIcon,
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

export function stateWord(station: Station, state: State) {
  return (station.juice && juiceLabel[state]) || stateLabel[state]
}

export function partAt(part: Part, instant: Instant) {
  return part.route[part.pos[instant]] ?? part.route[0]!
}

/**
 * The shop floor from above: a tile for every station, the lines of the material flow between them,
 * and under each tile the parts that are there. A chosen part draws its path: solid where it has
 * been, dashed where it is going.
 */
export function FloorMap({
  instant,
  lens,
  machine,
  part,
  onMachine,
  onPart,
}: {
  instant: Instant
  lens: Lens
  machine: string | null
  part: Part | null
  onMachine: (id: string) => void
  onPart: (id: string) => void
}) {
  const pos = part ? part.pos[instant] : -1
  const here = part ? partAt(part, instant) : null
  const path: Record<string, "done" | "plan"> = {}
  if (part) {
    part.route.slice(1).forEach((to, index) => {
      path[`${part.route[index]}>${to}`] = pos > index ? "done" : "plan"
    })
  }
  const lines = Object.entries(edges)
    .map(([key, segments]) => ({ key, segments, look: part ? (path[key] ?? "off") : "base" }))
    // The path of the part is drawn last, over the other lines.
    .sort((a, b) => Number(a.look === "done" || a.look === "plan") - Number(b.look === "done" || b.look === "plan"))

  return (
    <ScrollArea className="rounded-lg border bg-muted/30">
      <div
        className="relative m-2 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[16px_16px]"
        style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
      >
        {lines.map(({ key, segments, look }) =>
          // A horizontal segment runs from `a` to `b` at height `c`; a vertical one stands at `a`
          // and runs from `b` to `c`.
          segments.map(([axis, a, b, c], index) => {
            const width = look === "done" || look === "plan" ? 4 : 2
            return (
              <span
                key={`${key}-${index}`}
                aria-hidden
                className={cn(
                  "absolute",
                  look === "base" && "border-muted-foreground/60",
                  look === "off" && "border-border",
                  (look === "done" || look === "plan") && "border-primary",
                  look === "plan" && "border-dashed",
                )}
                style={
                  axis === "h"
                    ? { left: a, top: c - width / 2, width: b - a, borderTopWidth: width }
                    : { left: a - width / 2, top: b, height: c - b, borderLeftWidth: width }
                }
              />
            )
          }),
        )}
        {stations.map((station) => (
          <StationTile
            key={station.id}
            station={station}
            instant={instant}
            lens={lens}
            selected={!part && machine === station.id}
            here={here === station.id}
            dim={part !== null && !part.route.includes(station.id)}
            chosenPart={part}
            onOpen={() => onMachine(station.id)}
            onPart={onPart}
          />
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

function StationTile({
  station,
  instant,
  lens,
  selected,
  here,
  dim,
  chosenPart,
  onOpen,
  onPart,
}: {
  station: Station
  instant: Instant
  lens: Lens
  selected: boolean
  here: boolean
  dim: boolean
  chosenPart: Part | null
  onOpen: () => void
  onPart: (id: string) => void
}) {
  const { state, load, queue } = station.at[instant]
  const Icon = stepIcon[station.step]
  const blocked = here && state === "alarm"
  const big = station.juice ? `${load} %` : lens === "load" ? `${load} %` : String(queue)
  const bigLabel = station.juice ? "fill level" : lens === "load" ? "utilisation" : "parts waiting"
  const small = station.juice
    ? `${queue} cocktails today`
    : lens === "load"
      ? `${queue} parts waiting`
      : `${load} % utilisation`
  // One tracked part as a marker, everything else at the station as "+N".
  const atStation = station.juice ? [] : parts.filter((one) => partAt(one, instant) === station.id)
  const tracked = atStation.slice(0, 1)
  const more = queue + atStation.length - tracked.length

  return (
    <div className="absolute flex flex-col gap-1.5" style={{ left: station.x, top: station.y, width: TILE_WIDTH }}>
      {here && (
        <span
          className={cn(
            "absolute -top-2.5 right-2 z-10 rounded-full px-2 text-xs leading-5 font-medium",
            blocked ? "bg-destructive text-white" : "bg-primary text-primary-foreground",
          )}
        >
          {blocked ? "Part waits here" : "Part is here"}
        </span>
      )}
      <Item
        variant="outline"
        size="sm"
        render={<button type="button" onClick={onOpen} />}
        className={cn(
          "cursor-pointer content-start gap-1.5 bg-card pl-4 text-left hover:bg-muted/50",
          stripe[state],
          instant === "plan" && "border-dashed",
          station.juice && "bg-muted/40",
          state === "alarm" && "border-destructive",
          (selected || (here && !blocked)) && "border-primary ring-3 ring-primary/20",
          dim && "opacity-30",
        )}
        style={{ height: TILE_HEIGHT }}
      >
        <ItemHeader>
          <ItemMedia variant="icon">
            <Icon />
          </ItemMedia>
          <ItemTitle className="mr-auto block min-w-0 truncate">{station.name}</ItemTitle>
        </ItemHeader>
        <ItemContent className="gap-0.5">
          <span className="flex items-center gap-1.5 text-xs">
            <StateSymbol state={state} />
            {instant === "plan" ? "Plan: " : ""}
            {stateWord(station, state)}
          </span>
          <span className="flex items-baseline gap-1">
            <span className="text-xl font-semibold tabular-nums">{big}</span>
            <span className="truncate text-xs text-muted-foreground">{bigLabel}</span>
          </span>
        </ItemContent>
        <ItemFooter className="flex-col items-stretch gap-1">
          <Meter value={load} aria-label={station.juice ? "Fill level" : "Utilisation"} />
          <span className="flex items-center justify-between gap-1">
            <span className="truncate text-xs text-muted-foreground">{small}</span>
            {/* Room for the maker's logo. */}
            <span className="shrink-0 rounded-sm border border-dashed px-1 text-[0.625rem] text-muted-foreground">Logo</span>
          </span>
        </ItemFooter>
      </Item>
      {!station.juice && (
        <div className="flex gap-1">
          {tracked.map((one) => (
            <Button
              key={one.id}
              variant={chosenPart?.id === one.id ? "default" : "outline"}
              size="xs"
              className={cn(
                "w-16 rounded-full",
                state === "alarm" && chosenPart?.id !== one.id && "border-destructive/50 text-destructive",
                chosenPart && chosenPart.id !== one.id && "opacity-45",
              )}
              title={`${one.id} · ${one.name}`}
              aria-label={`Open part ${one.id}`}
              onClick={() => onPart(one.id)}
            >
              {one.id.slice(3)}
            </Button>
          ))}
          {more > 0 && (
            <Button
              variant="secondary"
              size="xs"
              className={cn("rounded-full", chosenPart && "opacity-45")}
              title={`${more} more parts at ${station.name}`}
              aria-label={`${more} more parts at ${station.name}`}
              onClick={onOpen}
            >
              +{more}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
