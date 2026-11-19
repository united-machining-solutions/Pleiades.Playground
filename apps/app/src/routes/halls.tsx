import type { Hall, Position, Site, SiteList } from "@pleiades/cards/site/contract.ts"
import { HallPlan } from "@pleiades/cards/site/hall-plan.tsx"
import { machinesInWords } from "@pleiades/cards/site/in-words.ts"
import { StateCounts } from "@pleiades/cards/site/state-counts.tsx"
import { countsOf } from "@pleiades/cards/site/counts.ts"
import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { toast } from "@pleiades/ui/components/toast"
import { createFileRoute, useRouter } from "@tanstack/react-router"
import { LayoutGridIcon, MapPinOffIcon } from "lucide-react"
import { useRef, useState } from "react"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { liveness, useLive, useRetry } from "@/hooks/use-live.ts"
import type { Live } from "@/hooks/use-live.ts"
import { machineFilters } from "@/live/machines.ts"
import { sitesAt, sitesWith } from "@/live/sites.ts"
import { getSites } from "@/machines/get-machines.ts"
import { withPositions } from "@/sites/positioning.ts"
import { positionMachine } from "@/sites/sites-api.ts"

/** The halls are read once, from the backend; then what every machine in them does comes from the broker. */
const live: Live<SiteList | null> = {
  filters: machineFilters(),
  message: (list, topic, payload, now) => list && sitesWith(list, topic, payload, now),
  at: (list, now) => list && sitesAt(list, now),
}

/**
 * Halls: every hall of every site as a plan seen from above, with its machines where they stand and
 * what each of them does now. The sites, their halls, the machines in them and their positions are
 * what people entered in the Sites API; the backend puts them together with the values of the machines
 * (`genui_site_list`), the same answer Home draws as lists. A machine nobody gave a position waits in
 * rows on the plan. A person drags a machine to where it stands, and the app keeps the position in the
 * Sites API, from its server. The page asks and draws; it computes nothing.
 */
export const Route = createFileRoute("/halls")({
  staticData: { nav: { title: "Halls", icon: LayoutGridIcon } },
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: () => getSites().catch((error: unknown) => ({ values: null, error: String(error) })),
  component: Halls,
  pendingComponent: Loading,
})

function Halls() {
  const answer = Route.useLoaderData()
  const { values: read, connected } = useLive(answer.values, live)
  useRetry(answer.values === null)
  const router = useRouter()
  // Where a person just dropped a machine: it stands there at once, and stays there while the Sites API is
  // asked and the list is read again. A position the API refused is taken back.
  const [moved, setMoved] = useState<ReadonlyMap<string, Position>>(new Map())
  const list = read && withPositions(read, moved)
  // The moves of one machine go to the Sites API one after the other, and only the newest of those that
  // wait is sent: two requests at once could arrive in either order, and a held arrow key makes many.
  const sending = useRef(new Map<string, Promise<void>>())
  const newest = useRef(new Map<string, Position>())
  const onMove = (machine: string, position: Position) => {
    newest.current.set(machine, position)
    setMoved((before) => new Map(before).set(machine, position))
    const back = () =>
      setMoved((before) => {
        // Only what this move put there: a later move of the same machine stays.
        if (before.get(machine) !== position) return before
        const without = new Map(before)
        without.delete(machine)
        return without
      })
    const refused = (reason: string) => toast.add({ type: "error", title: "The position was not kept", description: reason, priority: "high" })
    const send = async () => {
      // A newer move of the machine waits behind this one: that one is sent, this one is not.
      if (newest.current.get(machine) !== position) return
      try {
        const outcome = await positionMachine({ data: { machine, position } })
        if (!outcome.ok) refused(outcome.reason)
      } catch (error) {
        refused(error instanceof Error ? error.message : String(error))
      }
      if (newest.current.get(machine) !== position) return
      newest.current.delete(machine)
      // The list is read again either way: it says where the machine stands for the Sites API.
      try {
        await router.invalidate()
      } finally {
        back()
      }
    }
    const turn = (sending.current.get(machine) ?? Promise.resolve()).then(send, send)
    sending.current.set(machine, turn)
    void turn.finally(() => {
      if (sending.current.get(machine) === turn) sending.current.delete(machine)
    })
  }

  if (answer.values === null || list === null) {
    return (
      <Page>
        <NoAnswer error={answer.error ?? ""} />
      </Page>
    )
  }
  // A hall is a hall of a site with a name: the machines of a site in no hall have no plan.
  const sites = list.sites.filter((site) => site.halls.some((hall) => hall.name !== null))
  if (list.sitesError !== null || sites.length === 0) {
    return (
      <Page line={liveness(connected, list.asOf)}>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPinOffIcon />
            </EmptyMedia>
            <EmptyTitle>{list.sitesError !== null ? "The halls cannot be read now" : "No hall yet"}</EmptyTitle>
            <EmptyDescription>
              {list.sitesError !== null
                ? "The Sites API did not answer."
                : "Give a site a hall on Home, where a machine is added: every hall gets a plan here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </Page>
    )
  }
  return (
    <Page line={liveness(connected, list.asOf)}>
      {sites.map((site) => (
        <SiteHalls key={site.siteId} site={site} onMove={onMove} />
      ))}
    </Page>
  )
}

/** The halls of one site, each as a card with its plan. */
function SiteHalls({ site, onMove }: { site: Site; onMove: OnMove }) {
  return (
    <section aria-label={site.name} className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{site.name}</h2>
        <p className="text-sm text-muted-foreground">{site.company}</p>
      </div>
      {site.halls
        .filter((hall) => hall.name !== null)
        .map((hall) => (
          <HallCard key={hall.name} hall={hall} onMove={onMove} />
        ))}
    </section>
  )
}

type OnMove = (machine: string, position: Position) => void

function HallCard({ hall, onMove }: { hall: Hall; onMove: OnMove }) {
  const counts = countsOf(hall.machines.map((one) => one.state))
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-semibold group-data-[size=sm]/card:text-base">{hall.name}</CardTitle>
        {counts.length > 0 && (
          <CardDescription>
            <StateCounts counts={counts} />
          </CardDescription>
        )}
        <CardAction>
          <Badge variant="outline">{machinesInWords(hall.machines.length)}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <HallPlan hall={hall} onMove={onMove} />
      </CardContent>
    </Card>
  )
}

function Page({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold">Halls</h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
  )
}

function Loading() {
  return (
    <Page>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="aspect-video w-full" />
    </Page>
  )
}
