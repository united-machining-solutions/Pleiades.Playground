import type { ConditionKey, TimelineView, TrulaserStatus } from "@pleiades/cards/trulaser/contract.ts"
import { StatusWithHistory } from "@pleiades/cards/trulaser/trulaser-cards.tsx"
import { useCallback } from "react"

import { getTrulaserSeries, getTrulaserTimeline } from "@/machines/get-machines.ts"

/**
 * How a card reads the timelines of a view when it shows or opens them. They are not part of the values of
 * a card, because a language model reads those: whoever draws the card asks for them.
 */
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
  return <StatusWithHistory status={status} readTimeline={useReadTimeline(status.machine)} />
}
