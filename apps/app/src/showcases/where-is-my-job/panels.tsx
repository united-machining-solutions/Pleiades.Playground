import type { State } from "@pleiades/cards/machine/contract.ts"
import { stateBand } from "@pleiades/cards/machine/state-band.tsx"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@pleiades/ui/components/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"
import { Meter, MeterLabel, MeterValue } from "@pleiades/ui/components/meter"
import { Progress, ProgressLabel, ProgressValue } from "@pleiades/ui/components/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { cn } from "cn"
import { ArrowLeftIcon, CheckCheckIcon, ChevronRightIcon, CircleAlertIcon, MartiniIcon, SearchIcon, SearchXIcon } from "lucide-react"
import { Fragment, useState } from "react"

import { instantOf, partAt, parts, shiftClock, stationById, stations, stepName, stepState } from "./data.ts"
import type { Instant, Part, Station, StepState } from "./data.ts"
import { MakerLogo, stateWord, stepIcon } from "./floor-map.tsx"

const heading = "text-xs font-medium tracking-wide text-muted-foreground uppercase"

const processStations = stations.filter((one) => !one.juice)

/** The instant the bands and the lists of a machine are drawn around. */
const now = instantOf("now")

/** Perspective 1: what needs a person on the shop floor at the chosen instant. */
export function FloorPanel({
  instant,
  onMachine,
  onPart,
}: {
  instant: Instant
  onMachine: (id: string) => void
  onPart: (id: string) => void
}) {
  const at = (station: Station) => station.at[instant]
  const alarms = processStations.filter((one) => at(one).state === "alarm")
  const free = processStations.filter((one) => at(one).state !== "alarm")
  const bottleneck = free.length > 0 ? free.reduce((most, one) => (at(one).queue > at(most).queue ? one : most)) : null
  const delayed = parts.filter((one) => at(stationById[partAt(one, instant)]!).state === "alarm")
  const juice = stationById.JUI!
  const { name, clock } = instantOf(instant)

  const needs: Array<{ key: string; state: State | "warning"; title: string; detail: string; open: () => void }> = [
    ...alarms.map((one) => ({
      key: one.id,
      state: "alarm" as const,
      title: `${one.name} in alarm`,
      detail: one.alarm ?? "",
      open: () => onMachine(one.id),
    })),
    ...(bottleneck && at(bottleneck).queue >= 5
      ? [{
          key: "bottleneck",
          state: "warning" as const,
          title: `Bottleneck: ${bottleneck.name}`,
          detail: `${at(bottleneck).queue} parts in the queue${instant === "plan" ? ", planned" : ""}`,
          open: () => onMachine(bottleneck.id),
        }]
      : []),
    ...delayed.map((one) => ({
      key: one.id,
      state: "alarm" as const,
      title: `Shipping at risk: ${one.order}`,
      detail: `${one.id} waits at ${stationById[partAt(one, instant)]!.name} · ${one.due}`,
      open: () => onPart(one.id),
    })),
    ...(at(juice).load < 25
      ? [{
          key: "juice",
          state: "warning" as const,
          title: "Juice machine almost empty",
          detail: `Fill level ${at(juice).load} % · refill before the lunch round`,
          open: () => onMachine("JUI"),
        }]
      : []),
  ]

  return (
    <section className="flex flex-col gap-2">
      <h3 className={heading}>Needs you · {name} {clock}</h3>
      {needs.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Nothing needs you</EmptyTitle>
            <EmptyDescription>No alarm, no bottleneck and no part at risk at {clock}.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ItemGroup className="gap-2">
          {needs.map((one) => (
            <Item key={one.key} variant="outline" size="sm" render={<button type="button" onClick={one.open} />} className="cursor-pointer text-left hover:bg-muted/50">
              <ItemMedia variant="icon" className="h-5">
                <StateSymbol state={one.state} />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{one.title}</ItemTitle>
                <ItemDescription>{one.detail}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  )
}

/** Perspective 2: one station, what it did, does and will do. */
export function MachinePanel({
  station,
  instant,
  backTo,
  onBack,
  onPart,
}: {
  station: Station
  instant: Instant
  backTo: string | null
  onBack: () => void
  onPart: (id: string) => void
}) {
  const { state, load, queue, current, program } = station.at[instant]
  const Icon = stepIcon[station.step]
  const here = parts.filter((one) => partAt(one, instant) === station.id)
  const { name, clock } = instantOf(instant)
  let hours = 0
  return (
    <div className="flex flex-col gap-5">
      {backTo && (
        <Button variant="outline" size="sm" className="self-start" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to part {backTo}
        </Button>
      )}
      <Item variant="muted" size="sm">
        <ItemMedia variant="icon">
          <Icon />
        </ItemMedia>
        <ItemContent>
          <ItemTitle className="text-base">
            {station.name}
            <Badge variant="outline">
              <StateSymbol state={state} />
              {instant === "plan" ? "Plan: " : ""}
              {stateWord(station, state)}
            </Badge>
          </ItemTitle>
          <ItemDescription>{station.kind}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <MakerLogo />
        </ItemActions>
      </Item>
      {station.juice && (
        <Alert>
          <MartiniIcon />
          <AlertTitle>Not part of the shop floor</AlertTitle>
          <AlertDescription>It mixes cocktails for the team and is on no part's path.</AlertDescription>
        </Alert>
      )}
      {state === "alarm" && station.alarm && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Alarm</AlertTitle>
          <AlertDescription>{station.alarm}</AlertDescription>
        </Alert>
      )}
      <ItemGroup className="grid grid-cols-2 gap-3">
        <Item variant="outline" size="sm">
          <ItemContent>
            <Meter value={load} className="gap-1.5">
              <MeterLabel className="text-xs font-normal text-muted-foreground">{station.juice ? "Fill level" : "Utilisation"}</MeterLabel>
              <MeterValue className="text-xs" />
            </Meter>
          </ItemContent>
        </Item>
        <Item variant="outline" size="sm">
          <ItemContent>
            <ItemTitle className="text-xl tabular-nums">{queue}</ItemTitle>
            <ItemDescription className="text-xs">{station.juice ? "cocktails today" : "parts in the queue"}</ItemDescription>
          </ItemContent>
        </Item>
      </ItemGroup>
      <figure className="flex flex-col gap-1.5">
        <figcaption className={heading}>Was · is · will be</figcaption>
        <div className="relative">
          <div aria-hidden className="flex h-3 overflow-hidden rounded-sm">
            {station.band.map(([bandState, length], index) => {
              const planned = hours >= 8
              hours += length
              return (
                <div
                  key={index}
                  title={`${stateWord(station, bandState)} · ${length} h${planned ? " (plan)" : ""}`}
                  className={cn(stateBand[bandState], planned && "opacity-50")}
                  style={{ flexGrow: length, flexBasis: 0 }}
                />
              )
            })}
          </div>
          <span aria-hidden className="absolute -inset-y-1 left-2/3 w-0.5 bg-foreground" />
        </div>
        <div className="relative h-4 text-xs text-muted-foreground tabular-nums">
          <span className="absolute left-0">{shiftClock(now.clock, -8)}</span>
          <span className="absolute left-2/3 -translate-x-1/2 font-medium text-foreground">
            {now.name} {now.clock}
          </span>
          <span className="absolute right-0">Plan {shiftClock(now.clock, 4)}</span>
        </div>
      </figure>
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>
          {name} {clock}
        </h3>
        <p className="font-medium">{current}</p>
        <p className="text-sm text-muted-foreground">{program}</p>
        {here.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {here.map((one) => (
              <Button key={one.id} variant="outline" size="sm" className="rounded-full" onClick={() => onPart(one.id)}>
                {one.id} · {one.name}
                <ChevronRightIcon data-icon="inline-end" />
              </Button>
            ))}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>Done before {now.clock}</h3>
        {station.done.map(([time, text]) => (
          <p key={time + text} className="flex gap-3 text-sm">
            <span className="w-16 shrink-0 text-muted-foreground tabular-nums">{time}</span>
            {text}
          </p>
        ))}
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>Planned after {now.clock}</h3>
        <ItemGroup className="gap-1.5">
          {station.next.map(([time, text]) => (
            <Item key={time + text} variant="outline" size="xs" className="border-dashed">
              <ItemContent className="flex-row gap-3">
                <span className="w-12 shrink-0 text-muted-foreground tabular-nums">{time}</span>
                {text}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </section>
    </div>
  )
}

const stepTag: Record<StepState, { label: string; variant: "secondary" | "default" | "destructive" | "outline" }> = {
  done: { label: "Done", variant: "secondary" },
  current: { label: "In progress", variant: "default" },
  blocked: { label: "Waits: alarm", variant: "destructive" },
  planned: { label: "Planned", variant: "outline" },
}

/** Perspective 3: one part on its way, from programming to packing. */
export function PartPanel({
  part,
  instant,
  onMachine,
  onPart,
}: {
  part: Part
  instant: Instant
  onMachine: (id: string) => void
  onPart: (id: string) => void
}) {
  const pos = part.pos[instant]
  const last = part.route.length - 1
  const here = stationById[partAt(part, instant)]!
  const blocked = here.at[instant].state === "alarm"
  const siblings = parts.filter((one) => one.order === part.order && one.sheet === part.sheet && one.id !== part.id)
  const step = stepName[here.step]
  const lastStep = stepName[stationById[part.route[last]!]!.step]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-lg font-semibold">{part.id}</span>
        <span className="text-sm text-muted-foreground">
          {part.name} · {part.material} · order {part.order}
        </span>
      </div>
      <Alert variant={blocked ? "destructive" : "default"}>
        {blocked && <CircleAlertIcon />}
        <AlertTitle>
          {blocked
            ? `Delayed: waits at ${here.name} (alarm)`
            : `Step ${pos + 1} of ${last + 1}: ${step}${step === here.name ? "" : ` at ${here.name}`}`}
        </AlertTitle>
        <AlertDescription>
          {blocked
            ? "Shipping is at risk. The plan is being recalculated."
            : pos === last
              ? `${lastStep} since ${part.times[last]} · ${part.due}`
              : `${lastStep} at about ${part.times[last]} · ${part.due}`}
        </AlertDescription>
      </Alert>
      {/* The steps behind the part, so a part that is still being packed is not at 100 %. */}
      <Progress value={Math.round((pos / (last + 1)) * 100)}>
        <ProgressLabel className="text-xs font-normal text-muted-foreground">
          Order of {part.quantity} · sheet {part.sheet}, position {part.position}
        </ProgressLabel>
        <ProgressValue className="text-xs" />
      </Progress>
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>Known as</h3>
        <p className="text-xs text-muted-foreground">Sheet and position are set from programming on.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {part.ids.map(([label, value, from], index) => (
            <Fragment key={label}>
              {index > 0 && <span aria-hidden className="text-muted-foreground">→</span>}
              <Badge variant={value !== null && from <= pos ? "secondary" : "outline"} className={cn("h-auto flex-col items-start py-1", (value === null || from > pos) && "border-dashed")}>
                <span className="text-[0.625rem] font-normal text-muted-foreground">{label}</span>
                {value ?? "to come"}
              </Badge>
            </Fragment>
          ))}
        </div>
      </section>
      {/* The path as a vertical line of steps: no component draws one, so the dots and lines are our own. */}
      <ol className="flex flex-col">
        {part.route.map((id, index) => {
          const station = stationById[id]!
          const state = stepState(index, pos, blocked)
          const Icon = stepIcon[station.step]
          return (
            <li key={id} className="flex gap-3">
              <div className="flex w-4 shrink-0 flex-col items-center">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 size-3.5 shrink-0 rounded-full",
                    state === "done" && "bg-primary",
                    state === "current" && "border-4 border-primary bg-background ring-3 ring-primary/20",
                    state === "blocked" && "border-4 border-destructive bg-background ring-3 ring-destructive/20",
                    state === "planned" && "border-2 border-dashed border-muted-foreground bg-background",
                  )}
                />
                {index < last && (
                  <span aria-hidden className={cn("my-0.5 w-0 flex-1 border-l-2", index < pos ? "border-primary" : "border-dashed border-border")} />
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Icon className="size-4" />
                    {stepName[station.step]}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {state === "done" ? "" : state === "planned" ? "about " : "since "}
                    {part.times[index]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={stepTag[state].variant} className={cn(state === "planned" && "border-dashed")}>
                    {stepTag[state].label}
                  </Badge>
                  <Button variant="link" size="xs" className="h-auto px-0" onClick={() => onMachine(id)}>
                    {station.name}
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">{part.notes[index]}</span>
              </div>
            </li>
          )
        })}
      </ol>
      {siblings.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className={heading}>On the same sheet</h3>
          <ItemGroup className="gap-2">
            {siblings.map((one) => (
              <Item key={one.id} variant="outline" size="sm" render={<button type="button" onClick={() => onPart(one.id)} />} className="cursor-pointer text-left hover:bg-muted/50">
                <ItemContent>
                  <ItemTitle>{one.id}</ItemTitle>
                  <ItemDescription>at {stationById[partAt(one, instant)]!.name}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </section>
      )}
    </div>
  )
}

/** Every tracked part in one list, delayed ones first, with its path as a row of signs. */
export function PartsTable({
  instant,
  chosen,
  onPart,
}: {
  instant: Instant
  chosen: string | null
  onPart: (id: string) => void
}) {
  const [query, setQuery] = useState("")
  const words = query.trim().toLowerCase()
  const { name, clock } = instantOf(instant)
  const rows = parts
    .filter((one) => `${one.id} ${one.name} ${one.order} sheet ${one.sheet}`.toLowerCase().includes(words))
    .map((one) => {
      const pos = one.pos[instant]
      const here = stationById[partAt(one, instant)]!
      return { part: one, pos, here, blocked: here.at[instant].state === "alarm" }
    })
    .sort((a, b) => Number(b.blocked) - Number(a.blocked))

  return (
    <div className="flex flex-col gap-3">
      <InputGroup className="max-w-sm">
        <InputGroupInput
          type="search"
          placeholder="Find a part, an order or a sheet"
          aria-label="Find a part, an order or a sheet"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
      </InputGroup>
      {rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>No part found</EmptyTitle>
            <EmptyDescription>No part, order or sheet matches “{query}”.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Part</TableHead>
              <TableHead>Sheet · position</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>
                {name} {clock}
              </TableHead>
              <TableHead className="text-right">Packing</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ part, pos, here, blocked }) => (
              <TableRow
                key={part.id}
                data-state={chosen === part.id ? "selected" : undefined}
                className="cursor-pointer"
                onClick={() => onPart(part.id)}
              >
                <TableCell>
                  <Button variant="link" size="xs" className="h-auto px-0 font-semibold" onClick={(event) => { event.stopPropagation(); onPart(part.id) }}>
                    {part.id}
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    {part.name} · {part.order}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">
                  {part.sheet} · {part.position}
                </TableCell>
                <TableCell>
                  {/* The path as a row of signs: no component draws one, so these are our own. */}
                  <span className="flex items-center">
                    {part.route.map((id, index) => {
                      const station = stationById[id]!
                      const Icon = stepIcon[station.step]
                      const state = stepState(index, pos, blocked)
                      return (
                        <Fragment key={id}>
                          {index > 0 && (
                            <span aria-hidden className={cn("w-2 border-t-2", index <= pos ? "border-primary" : "border-dashed border-border")} />
                          )}
                          <span
                            title={`${stepName[station.step]} · ${station.name}`}
                            className={cn(
                              "flex size-6 items-center justify-center rounded-full",
                              state === "done" && "bg-primary text-primary-foreground",
                              state === "current" && "border-2 border-primary text-primary",
                              state === "blocked" && "border-2 border-destructive text-destructive",
                              state === "planned" && "border border-dashed border-muted-foreground text-muted-foreground",
                            )}
                          >
                            <Icon className="size-3.5" />
                          </span>
                        </Fragment>
                      )
                    })}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Badge variant={blocked ? "destructive" : pos === part.route.length - 1 ? "secondary" : "outline"}>
                      {blocked ? "Waits: alarm" : pos === part.route.length - 1 ? "Last step" : "In progress"}
                    </Badge>
                    {here.name}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {blocked ? "later than " : pos === part.route.length - 1 ? "since " : "about "}
                  {part.times[part.route.length - 1]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
