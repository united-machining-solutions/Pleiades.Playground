import type { MachineShow } from "@pleiades/cards/machine/contract.ts"
import { MachineCard } from "@pleiades/cards/machine/machine-card.tsx"
import type { Spans } from "@pleiades/cards/machine/state-band.tsx"
import { useEffect, useState } from "react"

import { getSpans } from "./get-machines.ts"

/**
 * The machine card for the values of a tool result, as a chat has them. The result holds no
 * spans, because a language model reads it, so the card asks for the spans of its band itself,
 * once, for the hours its values are about.
 */
export function ShownMachine({ values }: { values: MachineShow }) {
  const [spans, setSpans] = useState<Spans>()
  const { machine } = values.machine
  const { from, to } = values.history
  useEffect(() => {
    let wanted = true
    getSpans({ data: { machine, from, to } }).then(
      (read) => wanted && setSpans(read),
      () => wanted && setSpans(null),
    )
    return () => {
      wanted = false
    }
  }, [machine, from, to])
  return <MachineCard {...values} spans={spans} />
}
