import type { State } from "@pleiades/cards/machine/contract.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Alert, AlertDescription, AlertTitle } from "@pleiades/ui/components/alert"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@pleiades/ui/components/input-group"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@pleiades/ui/components/item"
import { Meter, MeterLabel, MeterValue } from "@pleiades/ui/components/meter"
import { Progress, ProgressLabel, ProgressValue } from "@pleiades/ui/components/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { cn } from "cn"
import { ArrowLeftIcon, ChevronRightIcon, CircleAlertIcon, MartiniIcon, SearchIcon } from "lucide-react"
import { Fragment, useState } from "react"

import { instants, parts, stationById, stations, stepName } from "./data.ts"
import type { Instant, Part, Station } from "./data.ts"
import { partAt, stateWord, stepIcon } from "./floor-map.tsx"

const heading = "text-xs font-medium tracking-wide text-muted-foreground uppercase"

/** How a state looks as a band on a time axis, as in the band of the machine card. */
const band: Record<State, string> = {
  running: "bg-state-running",
  alarm: "band-alarm",
  stopped: "bg-state-stopped shadow-[inset_0_0_0_1px_var(--state-stopped-edge)]",
  setup: "bg-state-setup shadow-[inset_0_0_0_1px_var(--state-setup-edge)]",
  "no-data": "band-no-data",
}

const processStations = stations.filter((one) => !one.juice)

function clockOf(instant: Instant) {
  return instants.find((one) => one.id === instant)!
}

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
  const waiting = processStations.reduce((sum, one) => sum + at(one).queue, 0)
  const load = Math.round(processStations.reduce((sum, one) => sum + at(one).load, 0) / processStations.length)
  const alarms = processStations.filter((one) => at(one).state === "alarm")
  const free = processStations.filter((one) => at(one).state !== "alarm")
  const bottleneck = free.reduce((most, one) => (at(one).queue > at(most).queue ? one : most), free[0]!)
  const delayed = parts.filter((one) => at(stationById[partAt(one, instant)]!).state === "alarm")
  const juice = stationById.JUI!

  const needs: Array<{ key: string; state: State | "warning"; title: string; detail: string; open: () => void }> = [
    ...alarms.map((one) => ({
      key: one.id,
      state: "alarm" as const,
      title: `${one.name} in alarm`,
      detail: one.alarm ?? "",
      open: () => onMachine(one.id),
    })),
    ...(at(bottleneck).queue >= 5
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
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          [String(waiting), "parts waiting"],
          [`${load} %`, "mean utilisation"],
          [String(alarms.length), alarms.length === 1 ? "alarm" : "alarms"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-lg border p-3">
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <section className="flex flex-col gap-2">
        <h3 className={heading}>Needs you · {clockOf(instant).name} {clockOf(instant).clock}</h3>
        {needs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs you at this time.</p>
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
    </div>
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
  const { state, load, queue } = station.at[instant]
  const Icon = stepIcon[station.step]
  const here = parts.filter((one) => partAt(one, instant) === station.id)
  let hours = 0
  return (
    <div className="flex flex-col gap-5">
      {backTo && (
        <Button variant="outline" size="sm" className="self-start" onClick={onBack}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to part {backTo}
        </Button>
      )}
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5" />
        </span>
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{station.name}</span>
            <Badge variant="outline">
              <StateSymbol state={state} />
              {instant === "plan" ? "Plan: " : ""}
              {stateWord(station, state)}
            </Badge>
          </div>
          <span className="text-sm text-muted-foreground">{station.kind}</span>
        </div>
      </div>
      {/* Room for the maker's logo. */}
      <span className="flex h-10 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
        Maker's logo
      </span>
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
      <div className="grid grid-cols-2 gap-3">
        <Meter value={load} className="gap-1.5 rounded-lg border p-3">
          <MeterLabel className="text-xs font-normal text-muted-foreground">{station.juice ? "Fill level" : "Utilisation"}</MeterLabel>
          <MeterValue className="text-xs" />
        </Meter>
        <div className="rounded-lg border p-3">
          <div className="text-xl font-semibold tabular-nums">{queue}</div>
          <div className="text-xs text-muted-foreground">{station.juice ? "cocktails today" : "parts in the queue"}</div>
        </div>
      </div>
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
                  className={cn(band[bandState], planned && "opacity-50")}
                  style={{ flexGrow: length, flexBasis: 0 }}
                />
              )
            })}
          </div>
          <span aria-hidden className="absolute -inset-y-1 left-2/3 w-0.5 bg-foreground" />
        </div>
        <div className="relative h-4 text-xs text-muted-foreground tabular-nums">
          <span className="absolute left-0">00:42</span>
          <span className="absolute left-2/3 -translate-x-1/2 font-medium text-foreground">Now 08:42</span>
          <span className="absolute right-0">Plan 12:42</span>
        </div>
      </figure>
      <section className="flex flex-col gap-1.5">
        <h3 className={heading}>{instant === "now" ? "Now" : instant === "past" ? "At 06:00" : "At 12:00 · plan"}</h3>
        <p className="font-medium">{station.current}</p>
        <p className="text-sm text-muted-foreground">{station.program}</p>
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
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-1.5">
          <h3 className={heading}>Done</h3>
          {station.done.map(([time, text]) => (
            <p key={time + text} className="flex gap-3 text-sm">
              <span className="w-16 shrink-0 text-muted-foreground tabular-nums">{time}</span>
              {text}
            </p>
          ))}
        </section>
        <section className="flex flex-col gap-1.5">
          <h3 className={heading}>Next · plan</h3>
          {station.next.map(([time, text]) => (
            <p key={time + text} className="flex gap-3 rounded-md border border-dashed px-2 py-1 text-sm">
              <span className="w-12 shrink-0 text-muted-foreground tabular-nums">{time}</span>
              {text}
            </p>
          ))}
        </section>
      </div>
    </div>
  )
}

type StepState = "done" | "current" | "blocked" | "planned"

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
  const stepOf = (index: number): StepState =>
    index < pos ? "done" : index === pos ? (blocked ? "blocked" : "current") : "planned"

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
            : `Step ${pos + 1} of ${last + 1}: ${stepName[here.id]}${stepName[here.id] === here.name ? "" : ` at ${here.name}`}`}
        </AlertTitle>
        <AlertDescription>
          {blocked ? "Shipping is at risk. The plan is being recalculated." : `Packed by about ${part.times[last]} · ${part.due}`}
        </AlertDescription>
      </Alert>
      <Progress value={Math.round((pos / last) * 100)}>
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
      <ol className="flex flex-col">
        {part.route.map((id, index) => {
          const station = stationById[id]!
          const step = stepOf(index)
          const Icon = stepIcon[station.step]
          return (
            <li key={id} className="flex gap-3">
              <div className="flex w-4 shrink-0 flex-col items-center">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 size-3.5 shrink-0 rounded-full",
                    step === "done" && "bg-primary",
                    step === "current" && "border-4 border-primary bg-background ring-3 ring-primary/20",
                    step === "blocked" && "border-4 border-destructive bg-background ring-3 ring-destructive/20",
                    step === "planned" && "border-2 border-dashed border-muted-foreground bg-background",
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
                    {stepName[id]}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {step === "done" ? "" : step === "planned" ? "about " : "since "}
                    {part.times[index]}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={stepTag[step].variant} className={cn(step === "planned" && "border-dashed")}>
                    {stepTag[step].label}
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Part</TableHead>
            <TableHead>Sheet · position</TableHead>
            <TableHead>Path</TableHead>
            <TableHead>Now</TableHead>
            <TableHead className="text-right">Packed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                No part matches “{query}”.
              </TableCell>
            </TableRow>
          )}
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
                <span className="flex items-center">
                  {part.route.map((id, index) => {
                    const Icon = stepIcon[stationById[id]!.step]
                    const step: StepState = index < pos ? "done" : index === pos ? (blocked ? "blocked" : "current") : "planned"
                    return (
                      <Fragment key={id}>
                        {index > 0 && (
                          <span aria-hidden className={cn("w-2 border-t-2", index <= pos ? "border-primary" : "border-dashed border-border")} />
                        )}
                        <span
                          title={`${stepName[id]} · ${stationById[id]!.name}`}
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full",
                            step === "done" && "bg-primary text-primary-foreground",
                            step === "current" && "border-2 border-primary text-primary",
                            step === "blocked" && "border-2 border-destructive text-destructive",
                            step === "planned" && "border border-dashed border-muted-foreground text-muted-foreground",
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
                    {blocked ? "Waits: alarm" : pos === part.route.length - 1 ? "At the end" : "In progress"}
                  </Badge>
                  {here.name}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {blocked ? "later than " : "about "}
                {part.times[part.route.length - 1]}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
