import { Pages } from "@pleiades/cards/shared/pages.tsx"
import type { SiteList, StateCount } from "@pleiades/cards/site/contract.ts"
import { machinesInWords } from "@pleiades/cards/site/in-words.ts"
import { StateCounts } from "@pleiades/cards/site/state-counts.tsx"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Card } from "@pleiades/ui/components/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@pleiades/ui/components/collapsible"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@pleiades/ui/components/input-group"
import { ItemGroup, ItemSeparator } from "@pleiades/ui/components/item"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@pleiades/ui/components/toggle-group"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { ChevronRightIcon, MapPinIcon, MapPinOffIcon, SearchIcon, SearchXIcon } from "lucide-react"
import { Fragment, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { useChatPanel } from "@/chat/ask.ts"
import { NoAnswer } from "@/components/no-answer.tsx"
import { liveness, useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { machineFilters } from "@/live/machines.ts"
import { sitesAt, sitesWith } from "@/live/sites.ts"
import { getSites } from "@/machines/get-machines.ts"
import { MachineRow } from "@/machines/machine-item.tsx"
import { changed, emptyOf, groupsOf, pageOf, pageOfSearch, showOf, showOfToggle } from "@/sites/filter.ts"
import type { Group, Row } from "@/sites/filter.ts"

/** The sites are read once, from the backend; then what every machine on them does comes from the broker. */
const live: Live<SiteList | null> = {
  filters: machineFilters(),
  message: (list, topic, payload, now) => list && sitesWith(list, topic, payload, now),
  at: (list, now) => list && sitesAt(list, now),
}

/**
 * Sites: where the machines stand, site by site and hall by hall, and what each of them does now.
 * The sites, their halls and the machines on them are what people entered in the Sites API; the
 * backend puts them together with the values of the machines (`genui_site_list`). The head of each
 * site says how many of its machines are in each state. Ten sites make a page; "Needs you" keeps the
 * machines that need someone, in their site and hall. The choice and the page are in the address,
 * `?show=needs&page=2`.
 */
export const Route = createFileRoute("/sites/")({
  // The entry of this page in the sidebar, right under Home. The page of a machine stands under it.
  staticData: { nav: { title: "Sites", icon: MapPinIcon, order: 1 } },
  // A value the page does not know is no value. Whether a page exists is checked against the list.
  validateSearch: (search): { show?: "needs" | undefined; page?: number | undefined } => ({
    show: showOf(search.show),
    page: pageOfSearch(search.page),
  }),
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: () => getSites().catch((error: unknown) => ({ values: null, error: String(error) })),
  component: Sites,
  pendingComponent: Loading,
})

function Sites() {
  const answer = Route.useLoaderData()
  const search = Route.useSearch()
  const needs = search.show === "needs"
  const [query, setQuery] = useState("")
  const { values: list, connected } = useLive(answer.values, live)
  useRetry(answer.values === null)
  const navigate = useNavigate()
  const bar = useRef<HTMLDivElement>(null)
  // The scrollbar keeps its room while a shorter page is drawn, so nothing shifts sideways.
  useEffect(() => {
    const root = document.documentElement
    const before = root.style.scrollbarGutter
    root.style.scrollbarGutter = "stable"
    return () => {
      root.style.scrollbarGutter = before
    }
  }, [])

  if (answer.values === null || list === null) {
    return (
      <Page>
        <NoAnswer error={answer.error ?? ""} />
      </Page>
    )
  }

  const onQuery = (next: string) => {
    setQuery(next)
    if (search.page !== undefined) void navigate({ to: ".", search: (previous) => changed(previous, {}), replace: true })
  }
  const onPage = (page: number) => {
    // A new page starts at the bar of the filters, under the header of the app.
    void navigate({ to: ".", search: (previous) => ({ ...previous, page: page === 1 ? undefined : page }) }).then(() =>
      bar.current?.scrollIntoView({ block: "start" }),
    )
  }
  const filtered = needs || query.trim() !== ""
  const { groups, emptySites } = groupsOf(list, { needs, query })
  const shown = pageOf(groups, search.page)
  const line = `${machinesInWords(list.machineCount)} on ${list.sites.length} ${list.sites.length === 1 ? "site" : "sites"} · ${liveness(connected, list.asOf)}`
  return (
    <Page line={list.sites.length === 0 ? liveness(connected, list.asOf) : line}>
      {list.sites.length === 0 && (
        <Empty className="flex-none">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPinOffIcon />
            </EmptyMedia>
            <EmptyTitle>No sites</EmptyTitle>
            <EmptyDescription>
              No site is entered in the Sites API yet
              {list.unplaced.length === 0 ? ", and no machine published a value in the last 24 hours." : "."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {/* The bar stands also without sites: what it chose shows, and it can be undone. */}
      <div ref={bar} className="scroll-mt-20">
        <Filters needs={needs} query={query} onQuery={onQuery} counts={list.counts} />
      </div>
      {shown.groups.length === 0 ? (
        // Without sites and without a filter, "No sites" above has said it all.
        (list.sites.length > 0 || filtered) && (
          <Nothing
            {...emptyOf({ needs, query })}
            onShowAll={() => {
              setQuery("")
              void navigate({ to: ".", search: (previous) => changed(previous, { show: undefined }) })
            }}
          />
        )
      ) : (
        <div className="flex flex-col gap-3">
          {shown.groups.map((group) => (
            <GroupSection key={group.site?.siteId ?? ""} group={group} asOf={list.asOf} />
          ))}
        </div>
      )}
      {emptySites.length > 0 && shown.page === shown.pages && <EmptySites names={emptySites.map((site) => site.name)} />}
      {shown.pages > 1 && (
        <Pages page={shown.page} pages={shown.pages} onPage={onPage} className="border-t pt-3">
          <p className="text-sm text-muted-foreground tabular-nums">
            Page {shown.page} of {shown.pages} · {shown.sites} {shown.sites === 1 ? "site" : "sites"}
          </p>
        </Pages>
      )}
      <ValidPage asked={search.page} shown={shown.page} />
    </Page>
  )
}

/** Why the list is empty, and where a filter is chosen, the way back to every machine. */
function Nothing({
  title,
  description,
  clearable,
  onShowAll,
}: {
  title: string
  description: string
  clearable: boolean
  onShowAll: () => void
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {clearable && (
        <EmptyContent>
          <Button onClick={onShowAll}>Show every machine</Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

/** The title is the block at the top of Home. */
function Page({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Sites</h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
  )
}

/** The search, and whether to show every machine or those that need someone; below, the counts of all sites. */
function Filters({
  needs,
  query,
  onQuery,
  counts,
}: {
  needs: boolean
  query: string
  onQuery: (query: string) => void
  counts: ReadonlyArray<StateCount>
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="max-w-md min-w-56 flex-1">
          <InputGroupInput
            type="search"
            placeholder="Find a machine, hall or site"
            aria-label="Find a machine, hall or site"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
        <ToggleGroup
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Show"
          value={[needs ? "needs" : "all"]}
          onValueChange={(chosen) => {
            // Pressing the chosen one again gives an empty choice, which changes nothing.
            const next = showOfToggle(chosen)
            if (next !== null && (next === "needs") !== needs) void navigate({ to: ".", search: (previous) => changed(previous, { show: next }) })
          }}
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="needs">Needs you</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {counts.length > 0 && <StateCounts counts={counts} label="All sites" />}
    </div>
  )
}

/**
 * A site, or the machines on no site: a head that stays under the header of the app while its rows
 * scroll, with the counts of the whole site, and a click on it folds the site. Then hall by hall the
 * rows; the halls without a machine share one line.
 */
function GroupSection({ group, asOf }: { group: Group; asOf: string }) {
  const title = group.site?.name ?? "On no site"
  return (
    <Collapsible defaultOpen render={<section aria-label={title} />} className="flex flex-col">
      {/* As an accordion has it: the heading holds the button that folds the site. */}
      <h2 className="sticky top-14 z-[5] border-b bg-background/95 backdrop-blur">
        <CollapsibleTrigger className="group/head flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left font-normal">
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]/head:rotate-90" />
          <span className="font-medium">{title}</span>
          <span className="text-sm text-muted-foreground">{group.site?.company ?? "Sent values in the last 24 hours"}</span>
          <span className="ml-auto flex flex-wrap items-center gap-3">
            {group.counts && <StateCounts counts={group.counts} inButton />}
            <Badge variant="secondary" className="tabular-nums">
              {machinesInWords(group.machines)}
            </Badge>
          </span>
        </CollapsibleTrigger>
      </h2>
      <CollapsibleContent className="flex flex-col gap-3 pt-3">
        {group.halls.map((hall) => (
          <div key={hall.name} className="flex flex-col gap-1.5">
            {group.site && <h3 className="text-xs font-medium text-muted-foreground">{hall.name}</h3>}
            <Rows rows={hall.rows} asOf={asOf} />
          </div>
        ))}
        {group.emptyHalls.length > 0 && <p className="text-xs text-muted-foreground">{group.emptyHalls.join(", ")}: no machine</p>}
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Rows of a list, one below the other with a line between, as the lists of Home. */
function Rows({ rows, asOf }: { rows: ReadonlyArray<Row>; asOf: string }) {
  const { ask } = useChatPanel()
  return (
    <Card className="gap-0 py-0">
      <ItemGroup className="gap-0">
        {rows.map((row, position) => (
          <Fragment key={row.machine.machine}>
            {position > 0 && <ItemSeparator className="my-0" />}
            <MachineRow machine={row.machine} state={row.state} asOf={asOf} onAsk={ask} name={row.name} what={row.what} linked={row.linked} />
          </Fragment>
        ))}
      </ItemGroup>
    </Card>
  )
}

/** The sites without a machine, named once at the end, on the last page; their names fold. */
function EmptySites({ names }: { names: ReadonlyArray<string> }) {
  return (
    <Collapsible className="flex flex-col gap-1 text-sm text-muted-foreground">
      <p>
        {names.length} {names.length === 1 ? "site has" : "sites have"} no machine yet.{" "}
        <CollapsibleTrigger render={<Button variant="ghost" size="sm" />} className="group/names">
          <span className="group-data-[panel-open]/names:hidden">Show them</span>
          <span className="hidden group-data-[panel-open]/names:inline">Hide them</span>
        </CollapsibleTrigger>
      </p>
      <CollapsibleContent>
        <p>{names.join(", ")}</p>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** A page in the address that does not exist becomes the one shown, without a new entry in the history. */
function ValidPage({ asked, shown }: { asked: number | undefined; shown: number }) {
  const navigate = useNavigate()
  useEffect(() => {
    if ((asked ?? 1) !== shown) void navigate({ to: ".", search: (previous) => ({ ...previous, page: shown === 1 ? undefined : shown }), replace: true })
  }, [asked, shown, navigate])
  return null
}

function Loading() {
  return (
    <Page>
      <Skeleton className="h-8 w-full max-w-md" />
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Page>
  )
}
