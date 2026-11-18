import type { ConditionKey, TimelineView, TrulaserStatus } from "@pleiades/cards/trulaser/contract.ts"
import type { Timeline } from "@pleiades/cards/trulaser/timelines.tsx"
import { HistoryCard, StatusCard } from "@pleiades/cards/trulaser/trulaser-cards.tsx"
import { useCallback, useEffect, useState } from "react"

import { getTrulaserSeries, getTrulaserTimeline } from "@/machines/get-machines.ts"

/**
 * The timelines of a view of a TruLaser for the hours asked for. They are not part of the values of a
 * card, because a language model reads those: whoever draws the card asks for them.
 */
export function useTrulaserTimeline(machine: string, view: TimelineView, hours: number): Timeline {
  const [timeline, setTimeline] = useState<Timeline>()
  useEffect(() => {
    let wanted = true
    setTimeline(undefined)
    getTrulaserTimeline({ data: { machine, view, hours } }).then(
      (read) => wanted && setTimeline(read),
      () => wanted && setTimeline(null),
    )
    return () => {
      wanted = false
    }
  }, [machine, view, hours])
  return timeline
}

/** How a card reads the timelines of a view when it opens them. */
export function useReadTimeline(machine: string) {
  return useCallback(
    (view: TimelineView, hours: number) => getTrulaserTimeline({ data: { machine, view, hours } }).catch(() => null),
    [machine],
  )
}

/** How the ConditionGuide card reads the values of one tile, for its chart. */
export function useReadSeries(machine: string, hours: number) {
  return useCallback(
    (key: ConditionKey) => getTrulaserSeries({ data: { machine, key, hours } }).catch(() => null),
    [machine, hours],
  )
}

/** State.Status for a tool result in the chat, with its history below, which the card asks for itself. */
export function ShownTrulaserStatus({ status }: { status: TrulaserStatus }) {
  const [hours, setHours] = useState(1)
  const timeline = useTrulaserTimeline(status.machine, "status", hours)
  return (
    <div className="flex flex-col gap-3">
      <StatusCard status={status} />
      <HistoryCard timeline={timeline} hours={hours} onHours={setHours} />
    </div>
  )
}
