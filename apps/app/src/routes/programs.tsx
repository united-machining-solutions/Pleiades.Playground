import type { Machine } from "@pleiades/cards/machine/contract.ts"
import { clock, duration } from "@pleiades/cards/machine/format.ts"
import { stateLabel, stateOf } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Badge } from "@pleiades/ui/components/badge"
import { buttonVariants } from "@pleiades/ui/components/button"
import { Card } from "@pleiades/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@pleiades/ui/components/item"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronRightIcon, FileCodeIcon } from "lucide-react"
import { Fragment } from "react"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { useLive } from "@/hooks/use-live.ts"
import { getMachines } from "@/machines/get-machines.ts"

/** Which program each machine runs now, read again every ten seconds. */
export const Route = createFileRoute("/programs")({
  staticData: { nav: { title: "Programs", icon: FileCodeIcon } },
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: () => getMachines().catch((error: unknown) => ({ values: null, error: String(error) })),
  component: Programs,
  pendingComponent: Loading,
})

function Programs() {
  const answer = Route.useLoaderData()
  useLive()

  if (answer.values === null) {
    return (
      <Page>
        <NoAnswer error={answer.error} />
      </Page>
    )
  }

  const { asOf, machines } = answer.values
  if (machines.length === 0) {
    return (
      <Page>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCodeIcon />
            </EmptyMedia>
            <EmptyTitle>No machines</EmptyTitle>
            <EmptyDescription>No machine has published a value in the last 24 hours.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    )
  }

  return (
    <Page line={`${machines.length} ${machines.length === 1 ? "machine" : "machines"} · live · now ${clock(asOf)}`}>
      <Card className="gap-0 py-0">
        <ItemGroup className="gap-0">
          {machines.map((machine, index) => (
            <Fragment key={machine.machine}>
              {index > 0 && <ItemSeparator className="my-0" />}
              <ProgramRow machine={machine} asOf={asOf} />
            </Fragment>
          ))}
        </ItemGroup>
      </Card>
    </Page>
  )
}

/** One machine: the program it runs, since when, and the way to its page. */
function ProgramRow({ machine, asOf }: { machine: Machine; asOf: string }) {
  const state = stateOf(machine, asOf)
  const { value, since, sinceIsLowerBound } = machine.program
  return (
    <Item role="listitem">
      {/* As tall as the first line, so the sign sits on it. */}
      <ItemMedia variant="icon" className="h-5">
        <StateSymbol state={state} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="font-mono">{value ?? "No program known"}</ItemTitle>
        <ItemDescription>
          {machine.machine}
          {/* Without data the program is the last one known, not what runs now. */}
          {state === "no-data" && (
            <Badge variant="outline" className="ml-2">
              {stateLabel[state]}
            </Badge>
          )}
        </ItemDescription>
      </ItemContent>
      {value !== null && since !== null && (
        <ItemContent className="text-right">
          <ItemTitle className="ml-auto tabular-nums">
            {sinceIsLowerBound ? "since before" : "since"} {clock(since)}
          </ItemTitle>
          <ItemDescription className="text-right tabular-nums">
            {sinceIsLowerBound ? "at least " : ""}
            {duration(since, asOf)}
          </ItemDescription>
        </ItemContent>
      )}
      <ItemActions>
        {/* The chat stays open while the page changes. */}
        <Link
          to="/machines/$machine"
          params={{ machine: machine.machine }}
          search
          className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          aria-label={`Open ${machine.machine}`}
        >
          <ChevronRightIcon />
        </Link>
      </ItemActions>
    </Item>
  )
}

function Page({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Programs</h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
  )
}

function Loading() {
  return (
    <Page>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </Page>
  )
}
