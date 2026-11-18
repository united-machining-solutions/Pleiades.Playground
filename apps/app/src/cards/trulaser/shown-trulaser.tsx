import type { ConditionKey, TrulaserShow } from "@pleiades/cards/trulaser/contract.ts"
import type { Timeline } from "@pleiades/cards/trulaser/timelines.tsx"
import { TrulaserCard } from "@pleiades/cards/trulaser/trulaser-card.tsx"
import { useCallback, useEffect, useState } from "react"

import { getTrulaserSeries, getTrulaserTimeline } from "@/machines/get-machines.ts"

/**
 * The timelines of a TruLaser for the hours asked for. They are not part of the values, because a
 * language model reads those: whoever draws the card asks for them, again when the hours change.
 */
export function useTrulaserTimeline(machine: string, hours: number, again: unknown = null): Timeline {
  const [timeline, setTimeline] = useState<Timeline>()
  useEffect(() => {
    let wanted = true
    setTimeline(undefined)
    getTrulaserTimeline({ data: { machine, hours } }).then(
      (read) => wanted && setTimeline(read),
      () => wanted && setTimeline(null),
    )
    return () => {
      wanted = false
    }
  }, [machine, hours, again])
  return timeline
}

/** How the card reads the values of one tile of the condition guide, for its chart. */
export function useReadSeries(machine: string, hours: number) {
  return useCallback(
    (key: ConditionKey) => getTrulaserSeries({ data: { machine, key, hours } }).catch(() => null),
    [machine, hours],
  )
}

/**
 * The TruLaser card for the values of a tool result, as a chat has them. The card asks for its
 * timelines and the charts of its tiles itself.
 */
export function ShownTrulaser({ values }: { values: TrulaserShow }) {
  const [hours, setHours] = useState(1)
  const timeline = useTrulaserTimeline(values.machine, hours)
  const readSeries = useReadSeries(values.machine, hours)
  return <TrulaserCard values={values} timeline={timeline} hours={hours} onHours={setHours} readSeries={readSeries} />
}
