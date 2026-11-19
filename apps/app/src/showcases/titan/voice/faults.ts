import type { MachineList } from "@pleiades/cards/machine/contract.ts"
import { openError } from "@pleiades/cards/machine/state.ts"
import { useEffect, useRef, useState } from "react"

import { getMachines } from "@/machines/get-machines.ts"
import { serialOf } from "../words.ts"

// The assistant page keeps an eye on the hall: every few seconds it reads the machines, and an error
// that was not there before is a new fault. The page then lets the assistant speak first.

/**
 * How often the hall is read: often enough that the orb reacts within moments, and no more often, since
 * every look reads every machine.
 */
const LOOK_EVERY_MS = 5_000

/** An error that a machine raised and that has not gone. */
export type Fault = {
  /** The machine as people call it, its serial number, for example P-04. */
  machine: string
  /** Its machine id, which the tools take. */
  id: string
  title: string
  notificationId: string
  raisedAt: string
}

/**
 * Calls `onFault` for each error that is raised while the page is open. The errors that are already
 * open when it opens are known, not new. Returns the machines that have an open error now, by
 * their serial numbers, and the list of machines as it was read last, for the board of Titan.
 */
export function useNewFaults(onFault: (fault: Fault) => void): { alarmed: ReadonlyArray<string>; list: MachineList | undefined } {
  const known = useRef<Set<string> | null>(null)
  const latest = useRef(onFault)
  latest.current = onFault
  const [alarmed, setAlarmed] = useState<ReadonlyArray<string>>([])
  const [list, setList] = useState<MachineList>()

  useEffect(() => {
    let open = true
    const look = async () => {
      const answer = await getMachines().catch(() => null)
      if (!open || !answer?.values) return
      setList(answer.values)
      const faults = answer.values.machines.flatMap((machine) => {
        const error = openError(machine)
        return error
          ? [{ key: error.correlationId, fault: { machine: serialOf(machine.machine), id: machine.machine, title: error.title, notificationId: error.notificationId, raisedAt: error.raisedAt } }]
          : []
      })
      setAlarmed(faults.map((one) => one.fault.machine))
      const keys = new Set(faults.map((one) => one.key))
      if (known.current === null) {
        known.current = keys
        return
      }
      for (const { key, fault } of faults) if (!known.current.has(key)) latest.current(fault)
      known.current = keys
    }
    void look()
    const timer = setInterval(() => void look(), LOOK_EVERY_MS)
    return () => {
      open = false
      clearInterval(timer)
    }
  }, [])

  return { alarmed, list }
}

/**
 * What the assistant is told when a fault arrives. It is no question of the person: it says so, and
 * asks for a short spoken message, the shop floor and a next step.
 */
export function faultBriefing(fault: Fault, person: string | undefined): string {
  const at = new Date(fault.raisedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
  const who = person ?? "der Person vor dem Bildschirm"
  return [
    `[Meldung der Anlage, nicht von ${person ?? "der Person"}] Um ${at} hat die Maschine ${fault.machine} (Maschinen-ID ${fault.id}) einen Fehler gemeldet: „${fault.title}“ (Fehler ${fault.notificationId}).`,
    `Sprich ${person ?? "die Person"} direkt an${person ? "" : ", ohne Namen,"} und sag ${who} in einem kurzen Satz auf Deutsch, was los ist, und gib eine Empfehlung. Der Bildschirm zeigt den Stand aller Maschinen schon, zeig keine Karte.`,
    `Schlag einen sinnvollen nächsten Schritt vor und frag am Ende, ob du die Details der Maschine zeigen sollst. Erfinde keine Ursache, die die Daten nicht nennen.`,
  ].join(" ")
}

/** What the orb says when there is no language model to ask: the fault itself. */
export function faultInWords(fault: Fault, person: string | undefined): string {
  return `${person ? `${person}, ` : ""}Achtung: Die Maschine ${fault.machine} hat gerade einen Fehler gemeldet. ${fault.title}.`
}
