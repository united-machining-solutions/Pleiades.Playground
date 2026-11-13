import { clock } from "@pleiades/cards/machine/format.ts"
import { MachineCard } from "@pleiades/cards/machine/machine-card.tsx"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { Link, createFileRoute, notFound } from "@tanstack/react-router"
import { SearchXIcon } from "lucide-react"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { buttonVariants } from "@pleiades/ui/components/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { useLive } from "@/hooks/use-live.ts"
import { getMachine, getMachines, getSpans } from "@/machines/get-machines.ts"

/**
 * One machine. The page asks the backend for the values of a card and draws the card, without a
 * language model: the same card a chat shows for the same tool. The spans of the card's band are
 * read with the values, for the same hours, so the card is whole when it appears.
 */
export const Route = createFileRoute("/machines/$machine")({
  loader: async ({ params }) => {
    const answer = await getMachine({ data: params.machine }).catch((error: unknown) => ({
      values: null,
      error: String(error),
    }))
    if (!answer.values) {
      // A backend that is away comes back, and the page keeps trying. A machine the backend does
      // not know does not: the list tells the two apart.
      const list = await getMachines().catch(() => null)
      if (list?.values && !list.values.machines.some((one) => one.machine === params.machine)) throw notFound()
      return { answer, spans: null }
    }
    const { from, to } = answer.values.history
    const spans = await getSpans({ data: { machine: params.machine, from, to } }).catch(() => null)
    return { answer, spans }
  },
  component: Machine,
  pendingComponent: Loading,
  notFoundComponent: NoMachine,
})

function Machine() {
  const { answer, spans } = Route.useLoaderData()
  const { machine } = Route.useParams()
  useLive()
  return (
    <Page machine={machine} line={answer.values ? `live · now ${clock(answer.values.asOf)}` : undefined}>
      {answer.values ? <MachineCard {...answer.values} spans={spans} /> : <NoAnswer error={answer.error} />}
    </Page>
  )
}

/** The page of a machine is titled with the machine; the way back is the breadcrumb in the header. */
function Page({ machine, line, children }: { machine?: string; line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {machine && (
        <div>
          <h1 className="text-2xl font-semibold">{machine}</h1>
          {line && <p className="text-sm text-muted-foreground">{line}</p>}
        </div>
      )}
      {children}
    </div>
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
