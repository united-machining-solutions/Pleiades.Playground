import type { MachineList } from "@pleiades/cards/machine/contract.ts"
import { MachineCard } from "@pleiades/cards/machine/machine-card.tsx"
import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Button, buttonVariants } from "@pleiades/ui/components/button"
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
import { Link, createFileRoute, notFound, useNavigate } from "@tanstack/react-router"
import { SearchXIcon } from "lucide-react"
import { useMemo } from "react"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { liveness, useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { listAt, listWith, machineFilters, pageAt, pageWith } from "@/live/machines.ts"
import type { MachinePage } from "@/live/machines.ts"
import { getMachine, getMachines, getSpans } from "@/machines/get-machines.ts"
import { HOURS, choicesOf, chosenHours, hoursOf, matches } from "@/machines/switcher.ts"
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
 * a link keeps what a person chose.
 */
export const Route = createFileRoute("/machines/$machine")({
  // No entry in the sidebar: the page stands under Home. In the breadcrumb it is called by its machine.
  staticData: { crumb: (params) => params.machine ?? "" },
  // An address with hours the page does not offer shows the default history, as one without hours.
  // The router keeps the keys of the address that this function does not return, so `hours` is
  // returned even where it is nothing: otherwise `?hours=3` would stay in the search as it is.
  validateSearch: (search): { hours?: Hours | undefined } => ({ hours: hoursOf(search.hours) }),
  // Only the length of the history is chosen, in the address. The page rolls it on to now (`pageAt`).
  loaderDeps: ({ search }) => ({ hours: chosenHours(search.hours) }),
  loader: async ({ params, deps }) => {
    // The list serves the switcher, and tells a machine that is away from one that is unknown.
    const [answer, list] = await Promise.all([
      getMachine({ data: { machine: params.machine, hours: deps.hours } }).catch((error: unknown) => ({
        values: null,
        error: String(error),
      })),
      getMachines().catch(() => null),
    ])
    const machines = list?.values ?? null
    if (!answer.values) {
      // A backend that is away comes back, and the page keeps trying. A machine the backend does
      // not know does not: the list tells the two apart.
      if (machines && !machines.machines.some((one) => one.machine === params.machine)) throw notFound()
      return { answer, spans: null, list: machines }
    }
    const { from, to } = answer.values.history
    const spans = await getSpans({ data: { machine: params.machine, from, to } }).catch(() => null)
    return { answer, spans, list: machines }
  },
  component: Machine,
  pendingComponent: Loading,
  notFoundComponent: NoMachine,
})

function Machine() {
  const { answer, spans, list } = Route.useLoaderData()
  const { machine } = Route.useParams()
  const { hours } = Route.useSearch()
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
    <Page
      machine={machine}
      choices={choices}
      line={page ? liveness(connected, page.show.asOf) : undefined}
      actions={page && <HistoryHours hours={chosenHours(hours)} />}
    >
      {page ? <MachineCard {...page.show} spans={page.spans} /> : <NoAnswer error={answer.error ?? ""} />}
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
  choices,
  line,
  actions,
  children,
}: {
  machine?: string
  choices?: Array<Choice> | null
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
            <h1 className="text-2xl font-semibold" aria-label={machine}>
              {choices && choices.length > 0 ? <MachineSwitcher machine={machine} choices={choices} /> : machine}
            </h1>
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
function MachineSwitcher({ machine, choices }: { machine: string; choices: Array<Choice> }) {
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
            to: "/machines/$machine",
            params: { machine: choice.machine },
            search: (previous) => previous,
          })
        }
      }}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="ghost"
            aria-label={`${machine}, switch machine`}
            // The title keeps the size of a title; the button only makes it one that can be pressed.
            className="-ml-2 h-auto px-2 py-1 text-2xl font-semibold"
          />
        }
      >
        {machine}
      </ComboboxTrigger>
      <ComboboxContent className="w-72 sm:w-80">
        <ComboboxInput showTrigger={false} placeholder="Find a machine" aria-label="Find a machine" />
        <ComboboxEmpty>No machine of that name.</ComboboxEmpty>
        <ComboboxList>
          {(choice: Choice) => (
            <ComboboxItem key={choice.machine} value={choice}>
              <StateSymbol state={choice.state} />
              {choice.machine}
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
          void navigate({ to: ".", search: (previous) => ({ ...previous, hours: next }) })
        }
      }}
    >
      {HOURS.map((one) => (
        <ToggleGroupItem key={one} value={String(one)} aria-label={`${one} ${one === 1 ? "hour" : "hours"}`}>
          {one} h
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
          <Link to="/" search className={buttonVariants()}>
            All machines
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
