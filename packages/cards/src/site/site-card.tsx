import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@pleiades/ui/components/item"
import { Fragment } from "react"
import type { ReactNode } from "react"
import type { State } from "../machine/contract.ts"
import { clock, duration } from "../machine/format.ts"
import { stateLabel } from "../machine/state.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import { tell } from "../machine/tell.ts"
import type { Hall, PlacedMachine, Site, SiteList, UnplacedMachine } from "./contract.ts"
import { machinesInWords, modelOf, titleOfPlaced } from "./in-words.ts"
import { StateCounts } from "./state-counts.tsx"

/**
 * The site card: every site with its machines, hall by hall, and how many of them are in each
 * state; then the machines that send values and stand on no site. It draws the result of
 * `genui_site_list` and computes nothing but the wording.
 */
export function SiteCards({ asOf, source, sites, unplaced }: SiteList) {
  if (sites.length === 0 && unplaced.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No site is entered in the Sites API yet, and no machine published a value in the last 24 hours.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No site is entered in the Sites API yet.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3">
          {sites.map((site) => (
            <SiteCard key={site.siteId} site={site} asOf={asOf} source={source} />
          ))}
        </div>
      )}
      {unplaced.length > 0 && <UnplacedCard machines={unplaced} asOf={asOf} />}
    </div>
  )
}

/** One site: its plant and company, how many machines in each state, and its halls. */
export function SiteCard({ site, asOf, source }: { site: Site; asOf: string; source: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">{site.name}</CardTitle>
        <CardDescription>{site.company}</CardDescription>
        <CardAction>
          <Badge variant="outline">{machinesInWords(site.machineCount)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {site.counts.length > 0 && <StateCounts counts={site.counts} />}
        {site.halls.map((hall) => (
          <HallList key={hall.name ?? ""} hall={hall} asOf={asOf} />
        ))}
        {site.halls.length === 0 && <p className="text-sm text-muted-foreground">No hall and no machine yet.</p>}
      </CardContent>
      <CardFooter className="block text-xs break-words text-muted-foreground">
        Read at {clock(asOf)} from {source}, and from the state topics of each machine under machines/
        {"{machineId}"}/umati/
      </CardFooter>
    </Card>
  )
}

function HallList({ hall, asOf }: { hall: Hall; asOf: string }) {
  const name = hall.name ?? "No hall"
  return (
    <section aria-label={name} className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{name}</h3>
      {hall.machines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No machine</p>
      ) : (
        <Rows>
          {hall.machines.map((one) => (
            <MachineLine key={one.machine} placed={one} asOf={asOf} />
          ))}
        </Rows>
      )}
    </section>
  )
}

/** Rows of machines, one below the other with a line between, as the lists of Home. */
function Rows({ children }: { children: Array<ReactNode> }) {
  return (
    <ItemGroup className="gap-0">
      {children.map((row, position) => (
        <Fragment key={position}>
          {position > 0 && <ItemSeparator className="my-0" />}
          {row}
        </Fragment>
      ))}
    </ItemGroup>
  )
}

/**
 * A machine in a row: its sign, its title and what it is, and on the right its state and how long
 * it has held. The machine id is its tooltip.
 */
function MachineItem({
  machine,
  state,
  title,
  description,
  when,
}: {
  machine: string
  state: State
  title: string
  description?: string
  when?: string
}) {
  return (
    <Item role="listitem" size="xs" className="items-start px-0" title={machine}>
      {/* As tall as the first line, so the sign sits on it. */}
      <ItemMedia variant="icon" className="h-5">
        <StateSymbol state={state} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{title}</ItemTitle>
        {description && <ItemDescription>{description}</ItemDescription>}
      </ItemContent>
      <ItemContent className="text-right">
        <ItemTitle className="ml-auto font-normal">{stateLabel[state]}</ItemTitle>
        {when && <ItemDescription className="text-right tabular-nums">{when}</ItemDescription>}
      </ItemContent>
    </Item>
  )
}

/**
 * How long the state of a machine has held, in the words of the second line of a row of Home:
 * "30 min", or "at least 30 min" where it began before the values that were read. The row has no
 * room for the time of day as well; the duration says what the time alone would hide, a state
 * that began days ago. Nothing for a machine without values.
 */
function lastingOf({ now, state }: Pick<PlacedMachine, "now" | "state">, asOf: string): string | undefined {
  if (!now) return undefined
  const told = tell(now, state)
  return told.since ? `${told.atLeast ? "at least " : ""}${duration(told.since, asOf)}` : undefined
}

/** A machine of a hall: the name people know it by and what it is, and its state and how long it held. */
function MachineLine({ placed, asOf }: { placed: PlacedMachine; asOf: string }) {
  return (
    <MachineItem
      machine={placed.machine}
      state={placed.state}
      title={titleOfPlaced(placed)}
      description={placed.displayName ? modelOf(placed) : undefined}
      when={lastingOf(placed, asOf)}
    />
  )
}

/** The machines that send values and stand on no site: what can be put on one. */
function UnplacedCard({ machines, asOf }: { machines: ReadonlyArray<UnplacedMachine>; asOf: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">On no site</CardTitle>
        <CardDescription>Sent values in the last 24 hours, and stand on no site yet</CardDescription>
        <CardAction>
          <Badge variant="outline">{machinesInWords(machines.length)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Rows>
          {machines.map((one) => (
            <MachineItem
              key={one.machine}
              machine={one.machine}
              state={one.state}
              title={modelOf(one)}
              when={lastingOf(one, asOf)}
            />
          ))}
        </Rows>
      </CardContent>
      <CardFooter className="block text-xs break-words text-muted-foreground">
        Read at {clock(asOf)} from the topics of each machine under machines/{"{machineId}"}/
      </CardFooter>
    </Card>
  )
}
