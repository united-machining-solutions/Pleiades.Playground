import type { JobOrderShow } from "@pleiades/cards/joborder/contract.ts"
import { JobOrderCard } from "@pleiades/cards/joborder/joborder-card.tsx"
import type { Timeline } from "@pleiades/cards/joborder/joborder-card.tsx"
import { useEffect, useState } from "react"

import { getJobOrderTimeline } from "@/machines/get-machines.ts"

/**
 * The job order card for the values of a tool result, as a chat has them. The result holds no timeline,
 * because a language model reads it, so the card asks for it itself, once, for the machine and the hours
 * its values are about.
 */
export function ShownJobOrder({ values }: { values: JobOrderShow }) {
  const [timeline, setTimeline] = useState<Timeline>()
  const { machine, from, asOf } = values
  useEffect(() => {
    let wanted = true
    setTimeline(undefined)
    getJobOrderTimeline({ data: { machine, from, to: asOf } }).then(
      (read) => wanted && setTimeline(read),
      () => wanted && setTimeline(null),
    )
    return () => {
      wanted = false
    }
  }, [machine, from, asOf])
  return <JobOrderCard {...values} timeline={timeline} />
}
