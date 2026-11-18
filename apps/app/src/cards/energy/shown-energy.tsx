import type { EnergyShow } from "@pleiades/cards/energy/contract.ts"
import { EnergyCard } from "@pleiades/cards/energy/energy-card.tsx"
import type { Lines } from "@pleiades/cards/energy/energy-card.tsx"
import { useEffect, useState } from "react"

import { getEnergySeries } from "@/machines/get-machines.ts"
import { machinesKey, machinesOf } from "./results.ts"

/**
 * The energy card for the values of a tool result, as a chat has them. The result holds no lines,
 * because a language model reads it, so the card asks for the lines of its graph itself, once, for
 * the hours and machines its values are about.
 */
export function ShownEnergy({ values }: { values: EnergyShow }) {
  const [series, setSeries] = useState<Lines>()
  const { from, to } = values
  const machines = machinesKey(values.machines.map((one) => one.machine))
  useEffect(() => {
    let wanted = true
    if (machines === "") {
      setSeries(null)
      return
    }
    getEnergySeries({ data: { from, to, machines: machinesOf(machines) } }).then(
      (read) => wanted && setSeries(read),
      () => wanted && setSeries(null),
    )
    return () => {
      wanted = false
    }
  }, [from, to, machines])
  return <EnergyCard {...values} series={series} />
}
