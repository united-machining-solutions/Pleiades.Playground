import { EnergyCard } from "@pleiades/cards/energy/energy-card.tsx"
import type { EnergyShow } from "@pleiades/cards/energy/contract.ts"
import type { MachineList } from "@pleiades/cards/machine/contract.ts"
import { titleOf } from "@pleiades/cards/machine/in-words.ts"
import { MachineCard } from "@pleiades/cards/machine/machine-card.tsx"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import type { MeasurementList, MeasurementSeries } from "@pleiades/cards/measurement/contract.ts"
import { MeasurementTiles } from "@pleiades/cards/measurement/measurement-tiles.tsx"
import type { TileEnergy } from "@pleiades/cards/measurement/measurement-tiles.tsx"
import type { NotificationList } from "@pleiades/cards/notification/contract.ts"
import { NotificationCard } from "@pleiades/cards/notification/notification-card.tsx"
import type { SiteList } from "@pleiades/cards/site/contract.ts"
import type { TimeseriesShow } from "@pleiades/cards/timeseries/contract.ts"
import { Button, buttonVariants } from "@pleiades/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@pleiades/ui/components/combobox"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { Await, Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { SearchXIcon, ZapOffIcon } from "lucide-react"
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

import { ShownTimeseries } from "@/cards/timeseries/shown-timeseries.tsx"
import { chatOf } from "@/chat/ask.ts"
import { NoAnswer } from "@/components/no-answer.tsx"
import { liveness, useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { serverNow, subscribe } from "@/live/broker.ts"
import { listAt, listWith, machineFilters, pageAt, pageWith } from "@/live/machines.ts"
import type { MachinePage } from "@/live/machines.ts"
import { liveAt, livePageOf, liveWith, measurementFilters } from "@/live/measurements.ts"
import type { LivePage } from "@/live/measurements.ts"
import {
  getEnergy,
  getMachine,
  getMachines,
  getMeasurementSeries,
  getMeasurements,
  getNotifications,
  getSites,
  getSpans,
  getTimeseries,
} from "@/machines/get-machines.ts"
import type { Answer } from "@/machines/get-machines.ts"
import {
  alertFilter,
  changesAlerts,
  energyOf,
  energyRequest,
  hasValues,
  measurementsOf,
  oneLine,
  placeOf,
  placeWords,
  powerAndEnergyOf,
  powerRequest,
} from "@/machines/sections.ts"
import { HOURS, choicesOf, chosenHours, hoursOf, matches } from "@/machines/switcher.ts"
import { debounce, oneAtATime } from "@/machines/pacing.ts"
import type { Choice, Hours } from "@/machines/switcher.ts"

/** The list of machines of the switcher, kept up to date from the broker as Home keeps its list. */
const listLive: Live<MachineList | null> = {
  filters: machineFilters(),
  message: (list, topic, payload, now) => list && listWith(list, topic, payload, now),
  at: (list, now) => list && listAt(list, now),
}

/**
 * One machine. The page asks the backend for the values of a card and draws the card, without a
 * language model: the same card a chat shows for the same tool. The spans of the card's band are
 * read with the values, for the same hours, so the card is whole when it appears.
 *
 * The title switches to another machine, and the hours of the history are in the address, `?hours=8`:
 * a link keeps what a person chose. A change of the hours reads again what depends on them, the card
 * and the sections of alarms and of power and energy, and does not load the page again: the head and
 * what is there stay until the new answers come (`useHours`).
 *
 * Below the card stand the sections of the machine, each the card of a tool for this machine: what it
 * measures now, its alarms and warnings, and its power and energy, the hours of the address for all of
 * them but the values of now. They are asked for with the card and not waited for, so the card stands
 * as soon as it is read, and each section fails, or is empty, on its own.
 */
export const Route = createFileRoute("/sites/$machine")({
  // No entry in the sidebar: the page stands under Sites. In the breadcrumb it is called by its machine.
  staticData: { crumb: (params) => params.machine ?? "" },
  // An address with hours the page does not offer shows the default history, as one without hours.
  // The router keeps the keys of the address that this function does not return, so `hours` is
  // returned even where it is nothing: otherwise `?hours=3` would stay in the search as it is.
  validateSearch: (search): { hours?: Hours | undefined } => ({ hours: hoursOf(search.hours) }),
  // Only the length of the history is chosen, in the address. The page rolls it on to now (`pageAt`).
  // The loader reads the hours of the address when the page of a machine opens; a later change of them
  // is read by the page itself, so the router does not load the page again (`shouldReload`). Where the
  // backend did not answer, the page asks the router to load it again (`useRetry`), and it does.
  shouldReload: false,
  loader: async ({ params, location }) => {
    const hours = chosenHours((location.search as { hours?: unknown }).hours)
    const sections = sectionsOf(params.machine, hours)
    // The list serves the switcher, and tells a machine that is away from one that is unknown.
    const [card, list] = await Promise.all([cardOf(params.machine, hours), getMachines().catch(() => null)])
    const machines = list?.values ?? null
    // A backend that is away comes back, and the page keeps trying. A machine the backend does not
    // know does not: the list tells the two apart.
    if (!card.answer.values && machines && !machines.machines.some((one) => one.machine === params.machine)) throw notFound()
    return { ...card, list: machines, sections }
  },
  component: Machine,
  pendingComponent: Loading,
  notFoundComponent: NoMachine,
})

/** An answer that could not be had, as the server functions give one. */
const failed = (error: unknown): Answer<never> => ({ values: null, error: String(error) })

/** The card of the machine over the hours, and the spans of its band, read with it so the card is whole. */
async function cardOf(machine: string, hours: Hours) {
  const answer = await getMachine({ data: { machine, hours } }).catch(failed)
  if (!answer.values) return { hours, answer, spans: null }
  const { from, to } = answer.values.history
  const spans = await getSpans({ data: { machine, from, to } }).catch(() => null)
  return { hours, answer, spans }
}

/** What the machine measures now and where it stands: the same whatever hours are chosen. Of this machine only. */
function nowSectionsOf(machine: string) {
  const measurements = Promise.all([getMeasurements({ data: { machine } }).catch(failed), getMeasurementSeries({ data: { machine } }).catch(failed)])
  return { measurements, sites: getSites().catch(failed) }
}

/**
 * The sections that depend on the hours. What the machine measures now decides what the section of
 * power and energy asks for: a machine without power and meter is not asked.
 */
function hourSectionsOf(machine: string, hours: Hours, measurements: ReturnType<typeof nowSectionsOf>["measurements"]) {
  const notifications = getNotifications({ data: { machine, hours } }).catch(failed)
  const power = measurements.then(async ([current]) => {
    const shows = powerAndEnergyOf(measurementsOf(current.values, machine))
    const [energy, timeseries] = await Promise.all([
      shows.energy ? getEnergy({ data: energyRequest(machine, hours) }).catch(failed) : null,
      shows.power ? getTimeseries({ data: powerRequest(machine, hours) }).catch(failed) : null,
    ])
    return { energy, timeseries }
  })
  return { hours, notifications, power }
}

/** The sections of the page of a machine, asked for at once. */
function sectionsOf(machine: string, hours: Hours) {
  const now = nowSectionsOf(machine)
  return { ...now, ...hourSectionsOf(machine, hours, now.measurements) }
}

type Sections = ReturnType<typeof sectionsOf>

/** What the page shows for its hours: the card with the spans of its band, and the sections. */
type HoursView = Awaited<ReturnType<typeof cardOf>> & { sections: Sections }

/**
 * What the page shows for the hours of the address. It starts with what the loader read; when the
 * hours change, it asks for the sections that depend on them at once and for the card, and keeps
 * showing the old card until the new one is there. Only the answer to the newest hours is taken.
 */
function useHours(machine: string, hours: Hours, loaded: HoursView): HoursView {
  const [view, setView] = useState(loaded)
  // When the loader has read again, after a backend did not answer, what it read replaces the view.
  const [from, setFrom] = useState(loaded)
  if (from !== loaded) {
    setFrom(loaded)
    setView(loaded)
  }
  const asked = useRef(0)
  useEffect(() => {
    if (hours === view.sections.hours) return
    const mine = ++asked.current
    setView((before) => ({ ...before, sections: { ...before.sections, ...hourSectionsOf(machine, hours, before.sections.measurements) } }))
    void cardOf(machine, hours).then((card) => {
      if (mine === asked.current) setView((before) => ({ ...before, ...card }))
    })
  }, [machine, hours, view.sections.hours])
  return view
}

function Machine() {
  // The loader data stays the same object until the loader reads again: useHours compares it.
  const read = Route.useLoaderData()
  const { list } = read
  const { machine } = Route.useParams()
  const { hours } = Route.useSearch()
  const { answer, spans, sections } = useHours(machine, chosenHours(hours), read)
  // What the backend read when the page was opened: the card, and the history up to then.
  const loaded = useMemo(() => (answer.values ? { show: answer.values, spans } : null), [answer, spans])
  // From then on the values of the machine come from the broker, and its history goes on with them: it
  // keeps the length that was read, the hours of the address, and rolls on to now.
  const live = useMemo(
    (): Live<MachinePage | null> => ({
      filters: machineFilters(machine),
      message: (page, topic, payload, now) => page && pageWith(page, topic, payload, now),
      at: (page, now) => page && pageAt(page, now),
    }),
    [machine],
  )
  const { values: page, connected } = useLive(loaded, live)
  // The list of machines of the switcher stays as live as the page: a machine that falls silent or goes
  // into alarm shows so in the list. The broker is asked once for a topic, however many pages hear it.
  const { values: machines } = useLive(list, listLive)
  const choices = useMemo(() => (machines ? choicesOf(machines) : null), [machines])
  useRetry(answer.values === null)
  return (
    // The title is the machine by its model and serial number, once the backend named them; the
    // address keeps its id.
    <Page
      machine={machine}
      title={page ? titleOf(page.show.machine) : undefined}
      choices={choices}
      place={<Place machine={machine} sites={sections.sites} />}
      line={page ? liveness(connected, page.show.asOf) : undefined}
      actions={page && <HistoryHours hours={chosenHours(hours)} />}
    >
      {page ? <MachineCard {...page.show} spans={page.spans} topics={false} /> : <NoAnswer error={answer.error ?? ""} />}
      <MachineSections machine={machine} sections={sections} />
    </Page>
  )
}

/**
 * The page of a machine is titled with the machine. With the list of machines, the title is where
 * a person switches to another; the way back is the breadcrumb in the header. Actions of the page
 * stand to the right of the title.
 */
function Page({
  machine,
  title = machine,
  choices,
  place,
  line,
  actions,
  children,
}: {
  /** The machine id, as the address names the machine. */
  machine?: string
  /** What the machine is called: its model and serial number, or its id until they are known. */
  title?: string
  choices?: Array<Choice> | null
  /** Where the machine stands, once the sites are read. */
  place?: ReactNode
  line?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {machine && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            {/* The button that opens the list gives the heading no name of its content: it is named here. */}
            <h1 className="text-2xl font-semibold" aria-label={title}>
              {choices && choices.length > 0 ? <MachineSwitcher machine={machine} title={title ?? machine} choices={choices} /> : title}
            </h1>
            {place}
            {line && <p className="text-sm text-muted-foreground">{line}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * The machine, as a button that opens the list of all machines to search in: the composition of
 * the docs of Combobox for a button as trigger, the search inside the popup. The list stands in the
 * order the backend gave it. A person who picks one goes to its page and keeps the address's
 * other values, the hours and the open chat.
 */
function MachineSwitcher({ machine, title, choices }: { machine: string; title: string; choices: Array<Choice> }) {
  const navigate = useNavigate()
  return (
    <Combobox
      items={choices}
      autoHighlight
      value={choices.find((one) => one.machine === machine) ?? null}
      itemToStringValue={(choice: Choice) => choice.machine}
      filter={(choice: Choice, query: string) => matches(choice, query)}
      isItemEqualToValue={(a: Choice, b: Choice) => a.machine === b.machine}
      onValueChange={(choice: Choice | null) => {
        if (choice && choice.machine !== machine) {
          void navigate({
            to: "/sites/$machine",
            params: { machine: choice.machine },
            // The hours chosen and the open chat go along, nothing else.
            search: (previous) => ({ ...chatOf(previous), hours: previous.hours }),
          })
        }
      }}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="ghost"
            aria-label={`${title}, switch machine`}
            // The title keeps the size of a title; the button only makes it one that can be pressed.
            className="-ml-2 h-auto px-2 py-1 text-2xl font-semibold"
          />
        }
      >
        {title}
      </ComboboxTrigger>
      <ComboboxContent className="w-72 sm:w-80">
        <ComboboxInput showTrigger={false} placeholder="Find a machine" aria-label="Find a machine" />
        <ComboboxEmpty>No machine of that name.</ComboboxEmpty>
        <ComboboxList>
          {(choice: Choice) => (
            <ComboboxItem key={choice.machine} value={choice}>
              <StateSymbol state={choice.state} />
              {choice.title}
              <span className="ml-auto text-muted-foreground">{stateLabel[choice.state]}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** How far back the history of the card goes. One is always chosen: pressing the chosen one changes nothing. */
function HistoryHours({ hours }: { hours: Hours }) {
  const navigate = useNavigate()
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="History"
      value={[String(hours)]}
      onValueChange={(chosen) => {
        const next = hoursOf(chosen[0])
        if (next !== undefined && next !== hours) {
          void navigate({ to: ".", search: (previous) => ({ ...chatOf(previous), hours: next }) })
        }
      }}
    >
      {HOURS.map((one) => (
        <ToggleGroupItem key={one} value={String(one)} aria-label={one === 1 ? "Last hour" : `Last ${one} hours`}>
          Last {one} h
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * A machine the backend does not know. The page says so once and does not ask again. It has no
 * title: a title would name a machine that is not there.
 */
function NoMachine() {
  const { machine } = Route.useParams()
  return (
    <Page>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon />
          </EmptyMedia>
          <EmptyTitle>No machine "{machine}"</EmptyTitle>
          <EmptyDescription>No machine of that name has published a value in the last 24 hours.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          {/* A link that looks like a button, as the docs of Button want it: a Button would take
              the role of a link away. The chat stays open while the page changes. */}
          <Link to="/sites" search={chatOf} className={buttonVariants()}>
            All sites
          </Link>
        </EmptyContent>
      </Empty>
    </Page>
  )
}

function Loading() {
  const { machine } = Route.useParams()
  return (
    <Page machine={machine}>
      <Skeleton className="h-56 w-full" />
    </Page>
  )
}

/** Where the machine stands, under its title: nothing while the sites are read, or where they could not be. */
function Place({ machine, sites }: { machine: string; sites: Promise<Answer<SiteList>> }) {
  return (
    <Await promise={sites} fallback={null}>
      {(answer) => {
        const words = placeWords(placeOf(answer.values, machine))
        return words && <p className="text-sm text-muted-foreground">{words}</p>
      }}
    </Await>
  )
}

/** How long a section that got no answer waits before it asks again, as a page does. */
const RETRY_MS = 10_000

/** How long the alarms wait after the last alert of a burst before they read the list again. */
const ALERTS_SETTLE_MS = 2_000

/**
 * The answer of one section: what the loader read, until the section reads it again with `read`. A
 * section that got no answer asks again on its own, so the others stand as they are.
 */
function useAnswer<TValues>(loaded: Answer<TValues>, read: () => Promise<Answer<TValues>>): [Answer<TValues>, () => void] {
  const [answer, setAnswer] = useState(loaded)
  // When the loader has read again, what it read replaces what the section had.
  const [from, setFrom] = useState(loaded)
  if (from !== loaded) {
    setFrom(loaded)
    setAnswer(loaded)
  }
  const reader = useRef(read)
  useEffect(() => {
    reader.current = read
  })
  // Only the answer to the newest question is taken.
  const asked = useRef(0)
  const again = useCallback(() => {
    const mine = ++asked.current
    reader.current().then(
      (next) => mine === asked.current && setAnswer(next),
      (error: unknown) => mine === asked.current && setAnswer(failed(error)),
    )
  }, [])
  // A retry waits for the answer to the last one: a slow backend gets no second question meanwhile.
  useEffect(() => {
    if (answer.values !== null) return
    const retry = oneAtATime(() => {
      const mine = ++asked.current
      return reader.current().then(
        (next) => mine === asked.current && setAnswer(next),
        (error: unknown) => mine === asked.current && setAnswer(failed(error)),
      )
    })
    const timer = setInterval(retry, RETRY_MS)
    return () => clearInterval(timer)
  }, [answer.values])
  return [answer, again]
}

/**
 * A section of the page of a machine: a card with its title, as the mock has them, and the cards of
 * the tools inside it without frames of their own. While it reads the answers for other hours, it
 * stays as it is, a little faded.
 */
function Section({ title, reading = false, children }: { title: string; reading?: boolean; children: ReactNode }) {
  return (
    <Card aria-busy={reading} className={reading ? "opacity-60 transition-opacity motion-reduce:transition-none" : "transition-opacity motion-reduce:transition-none"}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/**
 * The sections below the card, in the order of the page of a machine: what it measures now, its alarms
 * and warnings, and its power and energy over time. When the hours change, the sections are drawn with
 * the new answers only once they are there (`useDeferredValue`): until then each shows what it had,
 * and no section falls back to its placeholder.
 */
function MachineSections({ machine, sections }: { machine: string; sections: Sections }) {
  const shown = useDeferredValue(sections)
  const reading = shown !== sections
  return (
    <>
      <Await promise={shown.measurements} fallback={<Skeleton className="h-64 w-full" />}>
        {([current, series]) => <LiveValues machine={machine} current={current} series={series} power={shown.power} />}
      </Await>
      <Await promise={shown.notifications} fallback={<Skeleton className="h-48 w-full" />}>
        {(loaded) => <Alarms machine={machine} hours={shown.hours} loaded={loaded} reading={reading} />}
      </Await>
      <Await promise={shown.power} fallback={<Skeleton className="h-96 w-full" />}>
        {(power) => <PowerAndEnergy machine={machine} hours={shown.hours} energy={power.energy} timeseries={power.timeseries} reading={reading} />}
      </Await>
    </>
  )
}

/** The energy of the machine for its tile, once the section of power and energy has its answer. */
function useTileEnergy(power: Sections["power"], machine: string): TileEnergy {
  const [energy, setEnergy] = useState<TileEnergy>(undefined)
  useEffect(() => {
    let wanted = true
    power.then(
      (answer) => wanted && setEnergy(energyOf(answer.energy?.values ?? null, machine)),
      () => wanted && setEnergy(null),
    )
    return () => {
      wanted = false
    }
  }, [power, machine])
  return energy
}

/**
 * What the machine measures now, as tiles, live from the broker as the page Live values is: its power
 * with the last minutes, its energy over the hours of the page, its spindle and its feed.
 */
function LiveValues({
  machine,
  current,
  series,
  power,
}: {
  machine: string
  current: Answer<MeasurementList>
  series: Answer<MeasurementSeries>
  power: Sections["power"]
}) {
  const [now] = useAnswer(current, () => getMeasurements({ data: { machine } }).catch(failed))
  const [graphs] = useAnswer(series, () => getMeasurementSeries({ data: { machine } }).catch(failed))
  const loaded = useMemo(() => livePageOf(graphs.values, now.values), [graphs, now])
  const live = useMemo((): Live<LivePage> => ({ filters: measurementFilters(machine), message: liveWith, at: liveAt }), [machine])
  const { values: page } = useLive(loaded, live)
  const energy = useTileEnergy(power, machine)
  const measured = measurementsOf(page.current, machine)
  return (
    <Section title="Now">
      {now.values === null && graphs.values === null ? (
        <NoAnswer error={now.error ?? graphs.error ?? ""} />
      ) : hasValues(measured) ? (
        <MeasurementTiles machine={measured} series={oneLine(page.series, "activePower", machine)} energy={energy} />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No values</EmptyTitle>
            <EmptyDescription>The machine measured none of these quantities in the last 24 hours.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </Section>
  )
}

/**
 * The warnings and errors of the machine over the hours of the address. The list is read again the
 * moment the broker says that an alert of the machine was raised, changed or cleared.
 */
function Alarms({ machine, hours, loaded, reading }: { machine: string; hours: Hours; loaded: Answer<NotificationList>; reading: boolean }) {
  const [answer, again] = useAnswer(loaded, () => getNotifications({ data: { machine, hours } }).catch(failed))
  // A machine that raises and clears many alerts in a row is read again once, when they settle.
  useEffect(() => {
    const later = debounce(again, ALERTS_SETTLE_MS)
    const stop = subscribe([alertFilter(machine)], (topic, payload) => {
      if (changesAlerts(topic, payload, machine, Date.parse(serverNow()))) later.call()
    })
    return () => {
      stop()
      later.cancel()
    }
  }, [machine, again])
  return (
    <Section title="Alarms & warnings" reading={reading}>
      {answer.values ? <NotificationCard {...answer.values} bare /> : <NoAnswer error={answer.error} />}
    </Section>
  )
}

/**
 * The power of the machine over the hours of the address, as the graph of the time series card draws
 * it, and below it the energy it imported with its mean and peak power, as the energy card says it:
 * without its own graph, which the time series card draws already. Both stand in one card of the
 * section, without frames of their own; the hours are those of the page.
 */
function PowerAndEnergy({
  machine,
  hours,
  energy,
  timeseries,
  reading,
}: {
  machine: string
  hours: Hours
  energy: Answer<EnergyShow> | null
  timeseries: Answer<TimeseriesShow> | null
  reading: boolean
}) {
  return (
    <Section title="Power and energy" reading={reading}>
      {energy === null && timeseries === null ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ZapOffIcon />
            </EmptyMedia>
            <EmptyTitle>No power or energy</EmptyTitle>
            <EmptyDescription>{machine} publishes neither its active power nor an energy meter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {timeseries && <PowerOverTime machine={machine} hours={hours} loaded={timeseries} />}
          {energy && <Energy machine={machine} hours={hours} loaded={energy} />}
        </div>
      )}
    </Section>
  )
}

/** The power of the machine over the hours of the page; after a failed first read, it asks again for those hours. */
function PowerOverTime({ machine, hours, loaded }: { machine: string; hours: Hours; loaded: Answer<TimeseriesShow> }) {
  const [answer] = useAnswer(loaded, () => getTimeseries({ data: powerRequest(machine, hours) }).catch(failed))
  // A new answer for other hours keeps the graph, which reads its line again and draws the old one until then.
  return answer.values ? <ShownTimeseries values={answer.values} bare /> : <NoAnswer error={answer.error} />
}

/** The energy of the machine over the hours of the page; after a failed first read, it asks again for those hours. */
function Energy({ machine, hours, loaded }: { machine: string; hours: Hours; loaded: Answer<EnergyShow> }) {
  const [answer] = useAnswer(loaded, () => getEnergy({ data: energyRequest(machine, hours) }).catch(failed))
  return answer.values ? <EnergyCard {...answer.values} series={null} bare /> : <NoAnswer error={answer.error} />
}
