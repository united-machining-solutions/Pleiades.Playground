import type { Identity } from "@pleiades/cards/machine/contract.ts"
import { useCallback, useSyncExternalStore } from "react"

import type { Cluster } from "./floor.ts"

// The step of manufacturing a machine does, so the page can stand the machines of one step side by
// side. The step comes from what the machine says it is, `Identification.DeviceClass`; where it says
// nothing, from words of its model; where a person set one on the page, that one wins. The steps
// stand in a fixed order after the main groups of DIN 8580: primary shaping, then separating (cutting,
// turning, milling, grinding), then forming and joining.

export const STEPS = [
  { id: "printing", name: "Printing" },
  { id: "cutting", name: "Cutting" },
  { id: "turning", name: "Turning" },
  { id: "milling", name: "Milling" },
  { id: "grinding", name: "Grinding" },
  { id: "forming", name: "Forming" },
  { id: "joining", name: "Joining" },
] as const

export type StepId = (typeof STEPS)[number]["id"]

/** The cluster of the machines with no step. It stands after every step. */
export const NO_STEP = { id: "none", name: "No step" } as const

/** Where the step of a machine comes from. */
export type StepSource = "deviceClass" | "model" | "person" | "none"

export type MachineStep = { id: StepId | "none"; name: string; source: StepSource }

/**
 * Words of a device class, in English or German, and the step they mean. The first that matches counts:
 * joining and forming before cutting, as a laser or a tube also welds and bends ("laser welding
 * machine", "tube bender"). Printing is additive or 3D, not every "Druck": a die casting machine is
 * a "Druckgussmaschine".
 */
const DEVICE_CLASS_WORDS: ReadonlyArray<readonly [RegExp, StepId]> = [
  [/grind|schleif/i, "grinding"],
  [/lathe|turning|dreh/i, "turning"],
  [/machining cent|milling|fräs|fraes/i, "milling"],
  [/weld|joining|schweiß|schweiss|füge/i, "joining"],
  [/bend|press brake|forming|biege|umform/i, "forming"],
  [/laser|punch|cutting|stanz|schneid/i, "cutting"],
  [/additiv|3d[ -]?(print|druck)|printer|drucker/i, "printing"],
]

/**
 * Words of a model where the device class is missing: families of machines whose step is clear. Bending
 * and welding first, for the same reason: TubeBend bends, TruLaser Weld welds.
 */
const MODEL_WORDS: ReadonlyArray<readonly [RegExp, StepId]> = [
  [/bend/i, "forming"],
  [/weld/i, "joining"],
  [/laser|punch|trumatic|trupunch|tube/i, "cutting"],
  [/^um\d|ultimaker/i, "printing"],
]

const nameOf = (id: StepId) => STEPS.find((one) => one.id === id)!.name
const match = (words: typeof DEVICE_CLASS_WORDS, text: string | null | undefined) =>
  text ? (words.find(([pattern]) => pattern.test(text))?.[1] ?? null) : null

/** The step of a machine: what a person set, else from its device class, else from its model, else none. */
export function stepOf(identity: Identity, set: StepId | "none" | undefined): MachineStep {
  if (set === "none") return { ...NO_STEP, source: "person" }
  if (set) return { id: set, name: nameOf(set), source: "person" }
  const fromClass = match(DEVICE_CLASS_WORDS, identity.deviceClass)
  if (fromClass) return { id: fromClass, name: nameOf(fromClass), source: "deviceClass" }
  const fromModel = match(MODEL_WORDS, identity.model)
  if (fromModel) return { id: fromModel, name: nameOf(fromModel), source: "model" }
  return { ...NO_STEP, source: "none" }
}

/** The place of a step in the order of the steps; no step comes last. */
export function rankOf(id: StepId | "none"): number {
  const index = STEPS.findIndex((one) => one.id === id)
  return index === -1 ? STEPS.length : index
}

/**
 * The machines by their step: one cluster for each step that has a machine, in the order of the
 * steps, and "No step" last. Within a cluster the machines keep the order they came in.
 */
export function clustersOf(
  machines: ReadonlyArray<{ machine: string; identity: Identity }>,
  settings: StepSettings,
): ReadonlyArray<Cluster> {
  const byStep = new Map<StepId | "none", { name: string; machines: Array<string> }>()
  for (const one of machines) {
    const step = stepOf(one.identity, settings[one.machine])
    const group = byStep.get(step.id) ?? { name: step.name, machines: [] }
    group.machines.push(one.machine)
    byStep.set(step.id, group)
  }
  return [...byStep.entries()]
    .sort(([a], [b]) => rankOf(a) - rankOf(b))
    .map(([id, group]) => ({ id, name: group.name, machines: group.machines }))
}

// What a person set, in the localStorage of this browser: no service keeps it yet. A value that is
// no step is left out, and where the browser blocks the storage the page has no settings.

export const STEPS_KEY = "pleiades-playground.where-is-my-job.steps.v1"

export type StepSettings = Readonly<Record<string, StepId | "none">>

const isStep = (value: unknown): value is StepId | "none" =>
  value === "none" || STEPS.some((one) => one.id === value)

/** The settings in what the storage holds. */
export function settingsOf(raw: string | null): StepSettings {
  if (raw === null) return {}
  try {
    const held: unknown = JSON.parse(raw)
    if (typeof held !== "object" || held === null || Array.isArray(held)) return {}
    return Object.fromEntries(Object.entries(held).filter(([, value]) => isStep(value))) as StepSettings
  } catch {
    return {}
  }
}

const listeners = new Set<() => void>()
let cachedRaw: string | null = null
let cached: StepSettings = {}

function read(): StepSettings {
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(STEPS_KEY)
  } catch {
    raw = null
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cached = settingsOf(raw)
  }
  return cached
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => event.key === STEPS_KEY && listener()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

const EMPTY: StepSettings = {}

/** The steps a person set, and a way to save new ones (all at once; an empty object takes them all back). */
export function useStepSettings(): [StepSettings, (next: StepSettings) => void] {
  const settings = useSyncExternalStore(subscribe, read, () => EMPTY)
  const save = useCallback((next: StepSettings) => {
    try {
      if (Object.keys(next).length === 0) window.localStorage.removeItem(STEPS_KEY)
      else window.localStorage.setItem(STEPS_KEY, JSON.stringify(next))
    } catch {
      // The browser keeps nothing: the page stays as it is.
    }
    listeners.forEach((listener) => listener())
  }, [])
  return [settings, save]
}
