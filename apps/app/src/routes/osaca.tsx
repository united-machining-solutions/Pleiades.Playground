import { clock } from "@pleiades/cards/machine/format.ts"
import { Badge } from "@pleiades/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@pleiades/ui/components/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@pleiades/ui/components/empty"
import { Progress, ProgressLabel, ProgressValue } from "@pleiades/ui/components/progress"
import { Skeleton } from "@pleiades/ui/components/skeleton"
import { createFileRoute } from "@tanstack/react-router"
import { BoxIcon, RadioTowerIcon, TriangleAlertIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { ReactNode } from "react"

import { NoAnswer } from "@/components/no-answer.tsx"
import type { Answer } from "@/machines/get-machines.ts"
import { AxesCard } from "@/osaca/axes-card.tsx"
import { drivesOf, poseOf } from "@/osaca/axes.ts"
import type { Drive } from "@/osaca/axes.ts"
import type { OsacaSnapshot } from "@/osaca/contract.ts"
import { getOsaca } from "@/osaca/get-osaca.ts"
import { OsacaScene } from "@/osaca/osaca-scene.tsx"
import { RunJobButton } from "@/osaca/run-job-button.tsx"
import { AlertsCard, ChannelsCard, JobsCard, KeyFigures, MachineCard } from "@/osaca/umati-cards.tsx"

/**
 * The values are read again four times a second: the server answers from memory, and a new value of the cell
 * is seen soon after it came. The model moves between the values by their timestamps, see `osaca-scene.tsx`.
 */
const READ_EVERY_MS = 250

/** The height of the 3D view; the card of the axes next to it takes the same. */
const VIEW_HEIGHT = "h-[28rem]"

/**
 * The OSACA cell: a Stäubli robot on a rail that feeds a milling machine. The 3D view and the axes come from the
 * manufacturer values the cell publishes over MQTT (`oem`), the figures and tables from its umati values. The
 * page only shows; it sends nothing.
 */
export const Route = createFileRoute("/osaca")({
  staticData: { nav: { title: "OSACA cell", icon: BoxIcon } },
  // If the server of the app itself is away for a moment, the page says so and keeps trying.
  loader: (): Promise<Answer<OsacaSnapshot>> => getOsaca().catch((error: unknown) => ({ values: null, error: String(error) })),
  component: OsacaPage,
  pendingComponent: Loading,
})

function OsacaPage() {
  const first = Route.useLoaderData()
  const [answer, setAnswer] = useState(first)
  useEffect(() => {
    // A read that fails once keeps what the page shows: the values stay until an answer comes again.
    const keepOr = (next: Answer<OsacaSnapshot>) => (shown: Answer<OsacaSnapshot>) =>
      next.values === null && shown.values !== null ? shown : next
    const timer = setInterval(() => {
      getOsaca()
        .then((next) => setAnswer(keepOr(next)))
        .catch((error: unknown) => setAnswer(keepOr({ values: null, error: String(error) })))
    }, READ_EVERY_MS)
    return () => clearInterval(timer)
  }, [])

  if (answer.values === null) {
    return (
      <Page>
        <NoAnswer error={answer.error} />
      </Page>
    )
  }

  const { root, received, values, umati, topic, broker, connected } = answer.values
  const drives = drivesOf(values)
  const line =
    root && received
      ? `${root} · last value ${clock(received)}`
      : `Waiting for an OSACA cell on ${topic} at ${broker}`
  const live = root !== null && received !== null
  return (
    <Page
      line={line}
      badge={
        live && (
          <div className="flex items-center gap-3">
            <RunJobButton />
            <Badge variant={connected ? "secondary" : "destructive"}>{connected ? "Live" : "Reconnecting"}</Badge>
          </div>
        )
      }
    >
      {Object.keys(umati).length > 0 && <KeyFigures umati={umati} />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Cell</CardTitle>
            <CardDescription>Drag to turn, scroll to zoom, right-drag to move.</CardDescription>
          </CardHeader>
          <CardContent>
            <View drives={drives} />
          </CardContent>
        </Card>
        {drives.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <RadioTowerIcon />
              </EmptyMedia>
              <EmptyTitle>No values from the cell</EmptyTitle>
              <EmptyDescription>
                No OSACA cell has published on {topic} at {broker}. The model stands still until one does.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <AxesCard drives={drives} values={values} />
        )}
      </div>
      {Object.keys(umati).length > 0 && (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <JobsCard umati={umati} />
            <div className="flex flex-col gap-4">
              <ChannelsCard umati={umati} />
              <AlertsCard umati={umati} />
            </div>
          </div>
          <MachineCard umati={umati} />
        </>
      )}
    </Page>
  )
}

/** The 3D view, with the download of the model while it comes. It is drawn in the browser only. */
function View({ drives }: { drives: Drive[] }) {
  const [inBrowser, setInBrowser] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  useEffect(() => setInBrowser(true), [])
  const onProgress = useCallback((part: number) => setProgress(Math.round(part * 100)), [])

  if (failure !== null) {
    return (
      <Empty className={`${VIEW_HEIGHT} border`}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>The model could not be loaded</EmptyTitle>
          <EmptyDescription>{failure}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  return (
    <div className={`relative ${VIEW_HEIGHT} overflow-hidden rounded-lg bg-muted/40`}>
      {inBrowser && <OsacaScene pose={poseOf(drives)} onProgress={onProgress} onError={setFailure} />}
      {progress < 100 && (
        <div className="absolute inset-x-6 bottom-6">
          <Progress value={progress}>
            <ProgressLabel>Loading the model</ProgressLabel>
            <ProgressValue />
          </Progress>
        </div>
      )}
    </div>
  )
}

function Page({ line, badge, children }: { line?: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">OSACA cell</h1>
          {line && <p className="text-sm text-muted-foreground">{line}</p>}
        </div>
        {badge}
      </div>
      {children}
    </div>
  )
}

function Loading() {
  return (
    <Page>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="h-[38rem] w-full" />
        <Skeleton className="h-[38rem] w-full" />
      </div>
    </Page>
  )
}
