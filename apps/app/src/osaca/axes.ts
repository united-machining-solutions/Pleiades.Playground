import type { OemValue } from "./contract.ts"

// Which drive of the cell moves which part of the 3D model, and how a value on the wire becomes a pose.
// The drives are named by the PLC of the cell: "stäubli 1" … "stäubli 6" (the robot), "osaka X/Y/Z/C" (the
// milling machine), "linear" (the robot on its rail, X7) and "door". The publisher writes a name as one path
// segment, which has been both `StUbli1` and `Staeubli1`, so a name is matched by its letters and digits.

/** What a drive is, for the model and for the words on the page. */
export type DriveKind =
  | { part: "robot"; joint: number }
  | { part: "machine"; axis: "X" | "Y" | "Z" | "C" }
  | { part: "rail" }
  | { part: "door" }
  | { part: "other" }

export function kindOf(segment: string): DriveKind {
  const name = segment.toLowerCase().replace(/[^a-z0-9]/g, "")
  const robot = /^st[a-z]*bli([1-6])$/.exec(name)
  if (robot) return { part: "robot", joint: Number(robot[1]) }
  const machine = /^osa[ck]a([xyzc])$/.exec(name)
  if (machine) return { part: "machine", axis: machine[1].toUpperCase() as "X" | "Y" | "Z" | "C" }
  if (name.startsWith("linear")) return { part: "rail" }
  if (name.startsWith("door")) return { part: "door" }
  return { part: "other" }
}

/** A drive as the page shows it: its values as they came, grouped by the drive. */
export type Drive = { segment: string; kind: DriveKind; state?: string; actual?: OemValue; target?: OemValue }

/** The drives in the values below `<root>/oem`, in the order their first value arrived. */
export function drivesOf(values: Record<string, OemValue>): Drive[] {
  const drives = new Map<string, Drive>()
  for (const [path, value] of Object.entries(values)) {
    const [group, segment, field] = path.split("/")
    if (group !== "Drive" || !segment || !field) continue
    const drive = drives.get(segment) ?? { segment, kind: kindOf(segment) }
    if (field === "State" && typeof value.value === "string") drive.state = value.value
    if (field === "ActualPosition") drive.actual = value
    if (field === "TargetPosition") drive.target = value
    drives.set(segment, drive)
  }
  return [...drives.values()]
}

/** A rotary drive: the robot joints and the C axis turn, the others move along a line. */
export function isRotary(kind: DriveKind): boolean {
  return kind.part === "robot" || (kind.part === "machine" && kind.axis === "C")
}

/**
 * A rotary position in radian. The PLC counts the joints in degree; the publisher has labelled them with the
 * unit of length it gives every drive. Only `radian` is taken as it is.
 */
export function radianOf({ value, unit }: OemValue): number | null {
  if (typeof value !== "number") return null
  return unit === "radian" ? value : (value * Math.PI) / 180
}

/** A linear position in metre. The PLC counts in millimetre; `metre` is taken as it is. */
export function metreOf({ value, unit }: OemValue): number | null {
  if (typeof value !== "number") return null
  return unit === "metre" ? value : value / 1000
}

/** The position written for people: degree for what turns, millimetre for what moves along a line. */
export function written(kind: DriveKind, value: OemValue | undefined): string {
  if (!value) return "–"
  if (isRotary(kind)) {
    const radian = radianOf(value)
    return radian === null ? "–" : `${((radian * 180) / Math.PI).toFixed(1)} °`
  }
  const metre = metreOf(value)
  return metre === null ? "–" : `${(metre * 1000).toFixed(1)} mm`
}

/** One position of an axis and when the cell measured it, in milliseconds since 1970. */
export type Sample = { value: number; at: number }

/** Where the model is to stand: robot joints in radian, linear axes in metre; null where no value came. */
export type Pose = { joints: Array<Sample | null>; x: Sample | null; y: Sample | null; z: Sample | null; rail: Sample | null }

/** A position with the time of its measurement; a value without a timestamp counts as measured now. */
function sampleOf(value: number | null, { timestamp }: OemValue): Sample | null {
  if (value === null) return null
  const at = timestamp === undefined ? Number.NaN : Date.parse(timestamp)
  return { value, at: Number.isNaN(at) ? Date.now() : at }
}

export function poseOf(drives: Drive[]): Pose {
  const pose: Pose = { joints: [null, null, null, null, null, null], x: null, y: null, z: null, rail: null }
  for (const { kind, actual } of drives) {
    if (!actual) continue
    if (kind.part === "robot") pose.joints[kind.joint - 1] = sampleOf(radianOf(actual), actual)
    if (kind.part === "machine" && kind.axis === "X") pose.x = sampleOf(metreOf(actual), actual)
    if (kind.part === "machine" && kind.axis === "Y") pose.y = sampleOf(metreOf(actual), actual)
    if (kind.part === "machine" && kind.axis === "Z") pose.z = sampleOf(metreOf(actual), actual)
    if (kind.part === "rail") pose.rail = sampleOf(metreOf(actual), actual)
  }
  return pose
}

/** Whether a drive state is a fault, after DS402 and Sercos. */
export function isFault(state: string | undefined): boolean {
  return state !== undefined && /fault|error/i.test(state)
}
