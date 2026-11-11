import { clock } from "@pleiades/cards/machine/format.ts"
import { MachineCard } from "@pleiades/cards/machine/machine-card.tsx"
import { Link, createFileRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import { Skeleton } from "@/components/ui/skeleton"
import { useLive } from "@/hooks/use-live.ts"
import { getMachine, getSpans } from "@/machines/get-machines.ts"

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
    if (!answer.values) return { answer, spans: null }
    const { from, to } = answer.values.history
    const spans = await getSpans({ data: { machine: params.machine, from, to } }).catch(() => null)
    return { answer, spans }
  },
  component: Machine,
  pendingComponent: Loading,
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

function Page({ machine, line, children }: { machine: string; line?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {/* The chat stays open while the page changes. */}
          <Link to="/" search className="text-muted-foreground hover:text-foreground">
            Machines
          </Link>{" "}
          <span className="text-muted-foreground">/</span> {machine}
        </h1>
        {line && <p className="text-sm text-muted-foreground">{line}</p>}
      </div>
      {children}
    </div>
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
