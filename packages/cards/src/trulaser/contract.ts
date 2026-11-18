import { z } from "zod"

import { instant, machineId } from "../machine/contract.ts"

// The contract of the TruLaser card: what a TRUMPF laser cutting machine reports through the signals of
// its edge component, below `machines/{machineId}/oem/Dalle/`, and the laser of its control below
// `oem/Mos/`. Every value names the topic it comes from.

/** Where the signals of the edge component are published, below `machines/{machineId}/`. */
export const TRULASER_PREFIX = "oem/Dalle"

/**
 * Where each single value of the card is published, below `machines/{machineId}/`, and whether it is
 * text, a number or a yes or no.
 */
export const SIGNAL_PATHS = {
  itemState: { path: "oem/Dalle/MachineState/ItemState", kind: "text" },
  operationMode: { path: "oem/Dalle/MachineState/OperationMode", kind: "text" },
  changeCauseSignal: { path: "oem/Dalle/MachineState/ChangeCause/SignalName", kind: "text" },
  changeCauseValue: { path: "oem/Dalle/MachineState/ChangeCause/SignalValue", kind: "text" },
  unitsInMalfunction: { path: "oem/Dalle/MachineState/UnitsInMalfunctionList", kind: "text" },
  deviceRequestActive: {
    path: "oem/Dalle/MachineState/AutomationDeviceRequestStates/DeviceRequestStatusActive",
    kind: "flag",
  },
  productionPlanRunState: { path: "oem/Dalle/ProductionPlanRun/ProductionPlanRunState", kind: "text" },
  productionPlanRunId: { path: "oem/Dalle/ProductionPlanRun/ProductionPlanRunId", kind: "text" },
  programName: { path: "oem/Dalle/ProgramRun/ProgramName", kind: "text" },
  programRunState: { path: "oem/Dalle/ProgramRun/ProgramRunState", kind: "text" },
  programRunId: { path: "oem/Dalle/ProgramRun/ProgramRunId", kind: "text" },
  programRunPlanId: { path: "oem/Dalle/ProgramRun/ProductionPlanRunId", kind: "text" },
  collisionState: { path: "oem/Dalle/CollisionData/DetectionState", kind: "text" },
  collisionProgram: { path: "oem/Dalle/CollisionData/ProgramName", kind: "text" },
  collisionBlockPrevious: { path: "oem/Dalle/CollisionData/NcBlockGroup/0/Previous", kind: "text" },
  collisionBlockCurrent: { path: "oem/Dalle/CollisionData/NcBlockGroup/0/Current", kind: "text" },
  collisionBlockNext: { path: "oem/Dalle/CollisionData/NcBlockGroup/0/Next", kind: "text" },
  nozzleCollisionStop: { path: "oem/Dalle/CollisionData/ProcessingOptics/0/NozzleCollisionStop", kind: "flag" },
  laserOn: { path: "oem/Mos/Laser1/LaserEmissionOn", kind: "flag" },
  technologyStatus: { path: "oem/Dalle/LaserTechnology/DataProviderStatus", kind: "text" },
  technologyKey: { path: "oem/Dalle/LaserTechnology/LaserParameterSets/0/KeyName", kind: "text" },
  technologyParent: { path: "oem/Dalle/LaserTechnology/LaserParameterSets/0/Parent", kind: "text" },
  technologyNozzle: { path: "oem/Dalle/LaserTechnology/LaserParameterSets/0/Nozzle", kind: "text" },
  technologySetStatus: { path: "oem/Dalle/LaserTechnology/LaserParameterSets/0/Status", kind: "text" },
} as const satisfies Record<string, { path: string; kind: SignalKind }>
export type SignalName = keyof typeof SIGNAL_PATHS

/** Text, a number with its unit, or a yes or no. */
export type SignalKind = "text" | "number" | "flag"

/** Where the request states of the automation devices are published: one folder for each device, counted from 0. */
export const DEVICES_PATH = "oem/Dalle/MachineState/AutomationDeviceRequestStates/DeviceRequestStatuses"

/** Where the condition guide is published, below `machines/{machineId}/`. */
export const CONDITION_GUIDE_PATH = "oem/Dalle/ConditionGuide"

/**
 * How a display writes a value of the condition guide. The values are stored in SI units (ADR-0002):
 * a level as a fraction in `one`, a pressure in `pascal`. A conductance is published as a number in
 * `one`; the name of its topic says it is in microsiemens.
 */
export type Shown = "percent" | "millibar" | "microsiemens"

/**
 * The tiles of the condition guide, in the order the card shows them. Each is one value below
 * `CONDITION_GUIDE_PATH`, maybe a name next to it (`detail`, the gas or the container), and the
 * threshold flags the machine raises for it.
 */
export const CONDITION_GUIDE = [
  {
    key: "cutFluidLevel",
    label: "Cut fluid level",
    value: "CutFluidLevel/LevelInPercent",
    shown: "percent",
    errors: ["CutFluidLevel/LevelErrorReached"],
    warnings: ["CutFluidLevel/LevelWarningReached"],
  },
  {
    key: "coolLinePressureTank",
    label: "Cool line pressure tank",
    value: "CoolLineLevelPressureTank/LevelInPercent",
    shown: "percent",
    errors: ["CoolLineLevelPressureTank/ErrorLevelReached"],
    warnings: ["CoolLineLevelPressureTank/WarningLevelReached"],
  },
  {
    key: "coolLineRefillTank",
    label: "Cool line refill tank",
    value: "CoolLineLevelRefillTank/LevelInPercent",
    shown: "percent",
    errors: ["CoolLineLevelRefillTank/ErrorLevelReached"],
    warnings: ["CoolLineLevelRefillTank/WarningLevelReached"],
  },
  {
    key: "coolLinePressure",
    label: "Cool line pressure",
    value: "CoolLinePressureInPassiveState/PressureInMBar",
    shown: "millibar",
    errors: ["CoolLineThresholdsExceeded/ErrorLowerPressureLimitExceeded"],
    warnings: [
      "CoolLineThresholdsExceeded/WarningLowerPressureLimitExceeded",
      "CoolLineThresholdsExceeded/WarningUpperPressureLimitExceeded",
    ],
  },
  {
    key: "coolLineIonExchanger",
    label: "Cool line ion exchanger",
    value: "CoolLineIonExchanger/ConductanceInMicroSiemens",
    shown: "microsiemens",
    errors: ["CoolLineIonExchanger/ErrorConductanceThresholdExceeded"],
    warnings: ["CoolLineIonExchanger/WarningConductanceThresholdExceeded"],
  },
  {
    key: "gasSupply",
    label: "Gas supply",
    value: "GasSupplyPressuresInPassiveState/Pressures/0/PressureInMBar",
    detail: "GasSupplyPressuresInPassiveState/Pressures/0/GasType",
    shown: "millibar",
    errors: [
      "GasSupplyThresholdsExceededs/ThresholdsExceededs/0/ErrorLowerPressureLimitExceeded",
      "GasSupplyThresholdsExceededs/ThresholdsExceededs/0/ErrorUpperPressureLimitExceeded",
    ],
    warnings: [],
  },
  {
    // The thresholds of the cutting gas are published for the first gas only.
    key: "cuttingGas1",
    label: "Cutting gas 1",
    value: "CuttingGasInfeedPressuresInPassiveState/Pressures/0/PressureInMBar",
    detail: "CuttingGasInfeedPressuresInPassiveState/Pressures/0/GasType",
    shown: "millibar",
    errors: [
      "CuttingGasInfeedThresholdsExceededs/ThresholdsExceededs/0/ErrorLowerPressureLimitExceeded",
      "CuttingGasInfeedThresholdsExceededs/ThresholdsExceededs/0/ErrorUpperPressureLimitExceeded",
    ],
    warnings: ["CuttingGasInfeedThresholdsExceededs/ThresholdsExceededs/0/WarningLowerPressureLimitExceeded"],
  },
  {
    key: "cuttingGas2",
    label: "Cutting gas 2",
    value: "CuttingGasInfeedPressuresInPassiveState/Pressures/1/PressureInMBar",
    detail: "CuttingGasInfeedPressuresInPassiveState/Pressures/1/GasType",
    shown: "millibar",
    errors: [],
    warnings: [],
  },
  {
    key: "lubricantLevel",
    label: "Lubricant level",
    value: "LubricantLevels/LubricantLevels/0/LevelInPercent",
    detail: "LubricantLevels/LubricantLevels/0/ContainerName",
    shown: "percent",
    errors: ["LubricantLevels/LubricantLevels/0/LevelErrorReached"],
    warnings: ["LubricantLevels/LubricantLevels/0/LevelWarningReached"],
  },
] as const satisfies ReadonlyArray<{
  key: string
  label: string
  value: string
  detail?: string
  shown: Shown
  errors: ReadonlyArray<string>
  warnings: ReadonlyArray<string>
}>
export const CONDITION_KEYS = CONDITION_GUIDE.map((one) => one.key) as [
  (typeof CONDITION_GUIDE)[number]["key"],
  ...Array<(typeof CONDITION_GUIDE)[number]["key"]>,
]
export const conditionKey = z.enum(CONDITION_KEYS)
export type ConditionKey = z.infer<typeof conditionKey>

/** The newest value of one topic. */
export const signal = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]).nullable().describe("The newest value, or null if the topic had none."),
  unit: z.string().nullable().describe("The unit of a number, as it was published. Null for text and for a yes or no."),
  at: instant.nullable().describe("When the newest value was measured."),
  topic: z.string().describe("The MQTT topic the value comes from."),
})
export type Signal = z.infer<typeof signal>

/** What the change cause says: the state of the sequence that caused the change, and what blocks it. */
export type Sequence = { sequenceState: string; blockingCause: string | null }

/**
 * The value of a change cause as the edge component writes it, for example
 * `SequenceStateAndBlockingCause { SequenceState = Active, BlockingCause = Operator }`. Null if it is
 * not of that shape: then the text stands as it is.
 */
export function sequenceOf(text: string | null): Sequence | null {
  if (text === null) return null
  const state = /SequenceState = (\w+)/.exec(text)?.[1]
  if (state === undefined) return null
  const blocking = /BlockingCause = (\w+)/.exec(text)?.[1]
  return { sequenceState: state, blockingCause: blocking === undefined || blocking === "None" ? null : blocking }
}

/** The units in malfunction, as the edge component lists them: separated by commas, none if empty. */
export function unitsOf(list: string | number | boolean | null): Array<string> {
  if (typeof list !== "string") return []
  return list.split(",").flatMap((one) => one.trim() || [])
}

/** What the threshold flags of a tile say together: the worst that is raised, `ok` if none, null if it has none. */
export const tileStatus = z.enum(["error", "warning", "ok"]).nullable()
export type TileStatus = z.infer<typeof tileStatus>

export const flag = z.object({ level: z.enum(["error", "warning"]), signal })
export type Flag = z.infer<typeof flag>

/** The status of a tile from its flags. */
export function statusOf(flags: ReadonlyArray<Flag>): TileStatus {
  if (flags.length === 0) return null
  if (flags.some((one) => one.level === "error" && one.signal.value === true)) return "error"
  if (flags.some((one) => one.level === "warning" && one.signal.value === true)) return "warning"
  return "ok"
}

export const conditionTile = z.object({
  key: conditionKey,
  label: z.string(),
  shown: z.enum(["percent", "millibar", "microsiemens"]).describe("How a display writes the value."),
  value: signal,
  detail: signal.nullable().describe("The gas or the container the value is about, or null."),
  flags: z.array(flag).describe("The threshold flags the machine raises for this value."),
  status: tileStatus,
})
export type ConditionTile = z.infer<typeof conditionTile>

export const device = z.object({
  index: z.number().int().describe("The place of the device in the list of the machine, from 0."),
  type: signal.describe("What the device does, for example HandlingLoad."),
  state: signal.describe("The state of its request: Active, Idle or Invalid."),
  errorCode: signal,
})
export type Device = z.infer<typeof device>

/** The TruLaser card: what the machine does now, why, and the state of its media. */
export const trulaserShow = z.object({
  asOf: instant,
  machine: machineId.describe("The machine id, which identifies the machine in every topic."),
  serialNumber: z.string().nullable().describe("The serial number from umati/Identification/SerialNumber."),
  signals: z.record(z.enum(Object.keys(SIGNAL_PATHS) as [SignalName, ...Array<SignalName>]), signal),
  sequence: z
    .object({ sequenceState: z.string(), blockingCause: z.string().nullable() })
    .nullable()
    .describe("The change cause read: the state of the sequence and what blocks it, or null if it says neither."),
  unitsInMalfunction: z.array(z.string()).describe("The units in malfunction now, from `signals.unitsInMalfunction`."),
  devices: z.array(device).describe("The automation devices and the states of their requests."),
  conditionGuide: z.array(conditionTile).describe("The tiles of the condition guide, in the order of `CONDITION_GUIDE`."),
})
export type TrulaserShow = z.infer<typeof trulaserShow>

/** A stretch of time with one value of a lane. Null where nothing is known. */
export const laneSpan = z.object({ from: instant, to: instant, value: z.string().nullable() })
export type LaneSpan = z.infer<typeof laneSpan>

export const lane = z.object({
  key: z.string(),
  label: z.string(),
  topic: z.string().describe("The MQTT topic the values come from."),
  spans: z.array(laneSpan).describe("The values between `from` and `to`, oldest first and without a gap."),
})
export type Lane = z.infer<typeof lane>

/** How many hours the timelines can look back. */
export const TIMELINE_HOURS = [1, 8, 16, 24] as const
/** How many spans a lane has room for: about one for each pixel of its width. */
export const LANE_SLOTS = 900

/**
 * The timelines of the card: what the machine state, the change cause, the runs and every automation
 * device did between two instants, one lane each on the same time axis, and when a unit was in
 * malfunction. They grow with time, so a language model does not read them: the card asks for them.
 */
export const trulaserTimeline = z.object({
  machine: machineId,
  from: instant,
  to: instant,
  lanes: z.array(lane),
  malfunctions: z
    .array(z.object({ from: instant, to: instant, units: z.string() }))
    .describe("When units were in malfunction, and which. Never thinned: a short one is kept as it is."),
})
export type TrulaserTimeline = z.infer<typeof trulaserTimeline>

/** The values of one tile of the condition guide over time: what its chart draws. */
export const trulaserSeries = z.object({
  machine: machineId,
  key: conditionKey,
  label: z.string(),
  shown: z.enum(["percent", "millibar", "microsiemens"]),
  topic: z.string().describe("The MQTT topic the values come from."),
  unit: z.string().nullable().describe("The unit the values were published in."),
  from: instant,
  to: instant,
  points: z
    .array(z.object({ at: instant, value: z.number() }))
    .describe("Every value measured between `from` and `to`, oldest first; the first is the one that held at `from`."),
})
export type TrulaserSeries = z.infer<typeof trulaserSeries>

/** How the values of a lane are read from its topic. */
export type LaneRead = "as-is" | "sequence" | "units"

/**
 * The lanes of the timelines that are not an automation device, in the order the card shows them.
 * The devices follow the runs, one lane each, and the units in malfunction come last.
 */
export const LANES = [
  { key: "itemState", label: "Item state", signal: "itemState", read: "as-is" },
  { key: "operationMode", label: "Operation mode", signal: "operationMode", read: "as-is" },
  { key: "changeCause", label: "Change cause", signal: "changeCauseSignal", read: "as-is" },
  { key: "sequence", label: "Sequence", signal: "changeCauseValue", read: "sequence" },
  { key: "programRun", label: "Program run", signal: "programRunState", read: "as-is" },
  { key: "productionPlan", label: "Production plan", signal: "productionPlanRunState", read: "as-is" },
] as const satisfies ReadonlyArray<{ key: string; label: string; signal: SignalName; read: LaneRead }>

/** The lane of the units in malfunction. */
export const UNITS_LANE = {
  key: "unitsInMalfunction",
  label: "Units in malfunction",
  signal: "unitsInMalfunction",
  read: "units",
} as const

/** The key of the lane of an automation device. */
export const deviceLaneKey = (index: number) => `device${index}`

/**
 * What a value of a topic shows in its lane. The change cause shows the state of its sequence and,
 * if one blocks it, what. The units in malfunction show their list, nothing where it is empty.
 */
export function laneValueOf(read: LaneRead, value: string | null): string | null {
  if (value === null) return null
  if (read === "units") return unitsOf(value).join(", ") || null
  if (read === "sequence") {
    const sequence = sequenceOf(value)
    if (sequence === null) return value
    return sequence.blockingCause ? `${sequence.sequenceState}, blocked: ${sequence.blockingCause}` : sequence.sequenceState
  }
  return value
}
