import { z } from "zod"

import { instant, machineId, severity } from "@pleiades/cards/machine/contract.ts"

// The contracts of the TruLaser cards. They name what they show as the umati data model 0.17.1 does, and
// read it from its elements below `machines/{machineId}/umati/` and from the events of the model: the
// state (State.Status), the alerts (Notification.ActiveAlerts), the job order (JobMonitoring.JobOrders)
// and its program execution (WorkMasterMonitoring.ProgramExecution). What the model does not know comes
// from the extension of TRUMPF, `x-trumpf-com.Dalle.*` below `oem/Dalle/`: the change cause, the requests
// of the automation devices, the laser technology, the collision data and the condition guide. Each card
// answers one question. Every value names the topic it comes from.

/** Where the extension of TRUMPF publishes the signals of the edge component, below `machines/{machineId}/`. */
export const TRULASER_PREFIX = "oem/Dalle"

/** The name of the extension in the manifest of the machine. */
export const EXTENSION = "x-trumpf-com.Dalle"

/** Text, a number with its unit, or a yes or no. */
export type SignalKind = "text" | "number" | "flag"

/**
 * Where each single value of the cards is published, below `machines/{machineId}/`, and whether it is
 * text, a number or a yes or no. Below `umati/` an element of the model, below `oem/` the extension.
 */
export const SIGNAL_PATHS = {
  manufacturer: { path: "umati/Identification/Manufacturer", kind: "text" },
  model: { path: "umati/Identification/Model", kind: "text" },
  itemState: { path: "umati/State/Status/MachineryItemState", kind: "text" },
  operationMode: { path: "umati/State/Status/MachineryOperationMode", kind: "text" },
  executionId: { path: "umati/WorkMasterMonitoring/ProgramExecution/ExecutionId", kind: "text" },
  activeWorkMaster: { path: "umati/WorkMasterMonitoring/ProgramExecution/ActiveWorkMaster", kind: "text" },
  executionState: { path: "umati/WorkMasterMonitoring/ProgramExecution/State", kind: "text" },
  executionStartTime: { path: "umati/WorkMasterMonitoring/ProgramExecution/StartTime", kind: "text" },
  executionJobOrderId: { path: "umati/WorkMasterMonitoring/ProgramExecution/JobOrderID", kind: "text" },
  changeCauseSignal: { path: "oem/Dalle/MachineState/ChangeCause/SignalName", kind: "text" },
  changeCauseValue: { path: "oem/Dalle/MachineState/ChangeCause/SignalValue", kind: "text" },
  deviceRequestActive: {
    path: "oem/Dalle/MachineState/AutomationDeviceRequestStates/DeviceRequestStatusActive",
    kind: "flag",
  },
  collisionState: { path: "oem/Dalle/CollisionData/DetectionState", kind: "text" },
  collisionProgram: { path: "oem/Dalle/CollisionData/ProgramName", kind: "text" },
  collisionBlockPrevious: { path: "oem/Dalle/CollisionData/NcBlockGroup/0/Previous", kind: "text" },
  collisionBlockCurrent: { path: "oem/Dalle/CollisionData/NcBlockGroup/0/Current", kind: "text" },
  collisionBlockNext: { path: "oem/Dalle/CollisionData/NcBlockGroup/0/Next", kind: "text" },
  nozzleCollisionStop: { path: "oem/Dalle/CollisionData/ProcessingOptics/0/NozzleCollisionStop", kind: "flag" },
  technologyStatus: { path: "oem/Dalle/LaserTechnology/DataProviderStatus", kind: "text" },
  technologyKey: { path: "oem/Dalle/LaserTechnology/LaserParameterSets/0/KeyName", kind: "text" },
  technologyParent: { path: "oem/Dalle/LaserTechnology/LaserParameterSets/0/Parent", kind: "text" },
  technologyNozzle: { path: "oem/Dalle/LaserTechnology/LaserParameterSets/0/Nozzle", kind: "text" },
  technologySetStatus: { path: "oem/Dalle/LaserTechnology/LaserParameterSets/0/Status", kind: "text" },
} as const satisfies Record<string, { path: string; kind: SignalKind }>
export type SignalName = keyof typeof SIGNAL_PATHS

/** The single values each card shows. */
export const CARD_SIGNALS = {
  status: ["manufacturer", "model", "itemState", "operationMode", "changeCauseSignal", "changeCauseValue"],
  jobOrder: ["executionId", "activeWorkMaster", "executionState", "executionStartTime", "executionJobOrderId"],
  devices: ["deviceRequestActive"],
  technology: ["technologyStatus", "technologyKey", "technologyParent", "technologyNozzle", "technologySetStatus"],
  collision: [
    "collisionState",
    "collisionProgram",
    "collisionBlockPrevious",
    "collisionBlockCurrent",
    "collisionBlockNext",
    "nozzleCollisionStop",
  ],
} as const satisfies Record<string, ReadonlyArray<SignalName>>

/** Where the state of the connection of the adapter is published: a new start of it begins a new list of alerts. */
export const CONNECTION_PATH = "umati/Connection/State"

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
    label: "CutFluidLevel",
    value: "CutFluidLevel/LevelInPercent",
    shown: "percent",
    errors: ["CutFluidLevel/LevelErrorReached"],
    warnings: ["CutFluidLevel/LevelWarningReached"],
  },
  {
    key: "coolLinePressureTank",
    label: "CoolLineLevelPressureTank",
    value: "CoolLineLevelPressureTank/LevelInPercent",
    shown: "percent",
    errors: ["CoolLineLevelPressureTank/ErrorLevelReached"],
    warnings: ["CoolLineLevelPressureTank/WarningLevelReached"],
  },
  {
    key: "coolLineRefillTank",
    label: "CoolLineLevelRefillTank",
    value: "CoolLineLevelRefillTank/LevelInPercent",
    shown: "percent",
    errors: ["CoolLineLevelRefillTank/ErrorLevelReached"],
    warnings: ["CoolLineLevelRefillTank/WarningLevelReached"],
  },
  {
    key: "coolLinePressure",
    label: "CoolLinePressureInPassiveState",
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
    label: "CoolLineIonExchanger",
    value: "CoolLineIonExchanger/ConductanceInMicroSiemens",
    shown: "microsiemens",
    errors: ["CoolLineIonExchanger/ErrorConductanceThresholdExceeded"],
    warnings: ["CoolLineIonExchanger/WarningConductanceThresholdExceeded"],
  },
  {
    key: "gasSupply",
    label: "GasSupplyPressuresInPassiveState[0]",
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
    label: "CuttingGasInfeedPressuresInPassiveState[0]",
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
    label: "CuttingGasInfeedPressuresInPassiveState[1]",
    value: "CuttingGasInfeedPressuresInPassiveState/Pressures/1/PressureInMBar",
    detail: "CuttingGasInfeedPressuresInPassiveState/Pressures/1/GasType",
    shown: "millibar",
    errors: [],
    warnings: [],
  },
  {
    key: "lubricantLevel",
    label: "LubricantLevels[0]",
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

/** The signals of one card, by their names. */
function signalsOf<const TNames extends ReadonlyArray<SignalName>>(names: TNames) {
  return z.object(Object.fromEntries(names.map((name) => [name, signal])) as { [K in TNames[number]]: typeof signal })
}

/** What the change cause says: the state of the sequence that caused the change, and what blocks it. */
export type Sequence = { sequenceState: string; blockingCause: string | null }

/**
 * The SignalValue of a change cause as the edge component writes it, for example
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
  label: z.string().describe("The name of the signal in the extension."),
  shown: z.enum(["percent", "millibar", "microsiemens"]).describe("How a display writes the value."),
  value: signal,
  detail: signal.nullable().describe("The gas or the container the value is about, or null."),
  flags: z.array(flag).describe("The threshold flags the machine raises for this value."),
  status: tileStatus,
})
export type ConditionTile = z.infer<typeof conditionTile>

export const device = z.object({
  index: z.number().int().describe("The place of the device in the list of the machine, from 0."),
  type: signal.describe("What the device does: HandlingLoad, HandlingUnload, Sorting, Separating or Palletizing."),
  state: signal.describe("The state of its request: Active, Scheduled, Idle, Error or Invalid."),
  errorCode: signal,
})
export type Device = z.infer<typeof device>

/** An entry of Notification.ActiveAlerts: an alert that stands. */
export const alert = z.object({
  Id: z.string(),
  ErrorCode: z.string(),
  Message: z.string(),
  Severity: severity.nullable().describe("The category after NAMUR NE 107."),
  SeverityValue: z.number().nullable(),
  SourceName: z.string().describe("Where the alert comes from: for a unit in malfunction, the unit."),
  Time: instant.describe("Since when the alert stands."),
})
export type Alert = z.infer<typeof alert>

/** Where a category stands in the order a display reads them, after NE 107: Failure first, none last. */
export function severityRank(category: string | null): number {
  const rank = severity.options.indexOf((category ?? "") as (typeof severity.options)[number])
  return rank < 0 ? severity.options.length : rank
}

/** The alerts in the order a display reads them: the most urgent first, the newest first within a category. */
export function byUrgency(a: Pick<Alert, "Severity" | "Time">, b: Pick<Alert, "Severity" | "Time">): number {
  return severityRank(a.Severity) - severityRank(b.Severity) || b.Time.localeCompare(a.Time)
}

/** An entry of JobMonitoring.JobOrders with what came of it so far (JobMonitoring.JobOrderResults). */
export const jobOrder = z.object({
  JobOrderID: z.string(),
  State: z.string().describe("NotAllowedToStart, AllowedToStart, Running, Interrupted, Ended or Aborted."),
  StateSince: instant.nullable(),
  JobName: z.string().nullable(),
  WorkMasterID: z.string().nullable(),
  StartTime: instant.nullable(),
  EndTime: instant.nullable(),
  RunsCompleted: z.number().nullable(),
  JobResult: z.string().nullable(),
})
export type JobOrder = z.infer<typeof jobOrder>

/** What every card says about the machine it is about. */
const about = {
  asOf: instant,
  machine: machineId.describe("The machine id, which identifies the machine in every topic."),
  serialNumber: z.string().nullable().describe("Identification.SerialNumber."),
}

/**
 * State.Status and Notification.ActiveAlerts: what the machine does now, what caused it (the ChangeCause of
 * the extension), and the alerts that stand, a unit in malfunction among them.
 */
export const trulaserStatus = z.object({
  ...about,
  signals: signalsOf(CARD_SIGNALS.status),
  activeAlerts: z
    .array(alert)
    .describe("Notification.ActiveAlerts since the adapter started, the most urgent first: what the events of the alerts say stands."),
  alertsComplete: z
    .boolean()
    .describe("False if the Events API had more alerts than it returned: then the list may miss some."),
})
export type TrulaserStatus = z.infer<typeof trulaserStatus>

/** JobMonitoring.JobOrders and WorkMasterMonitoring.ProgramExecution: the job order and the program execution in it. */
export const trulaserJobOrder = z.object({
  ...about,
  jobOrder: jobOrder.nullable().describe("The job order that runs or is interrupted, else the newest one, or null."),
  signals: signalsOf(CARD_SIGNALS.jobOrder),
})
export type TrulaserJobOrder = z.infer<typeof trulaserJobOrder>

/** AutomationDeviceRequestStates of the extension: the request of each automation device now. */
export const trulaserDevices = z.object({
  ...about,
  signals: signalsOf(CARD_SIGNALS.devices),
  devices: z.array(device).describe("The automation devices in the order of their index."),
})
export type TrulaserDevices = z.infer<typeof trulaserDevices>

/** LaserTechnology of the extension: the laser parameter set the machine cuts with. */
export const trulaserTechnology = z.object({ ...about, signals: signalsOf(CARD_SIGNALS.technology) })
export type TrulaserTechnology = z.infer<typeof trulaserTechnology>

/** CollisionData of the extension: the collision detection and the NC blocks around the last detection. */
export const trulaserCollision = z.object({ ...about, signals: signalsOf(CARD_SIGNALS.collision) })
export type TrulaserCollision = z.infer<typeof trulaserCollision>

/** ConditionGuide of the extension: the levels and pressures of the media, with their thresholds. */
export const trulaserConditions = z.object({
  ...about,
  tiles: z.array(conditionTile).describe("The tiles in the order of `CONDITION_GUIDE`."),
})
export type TrulaserConditions = z.infer<typeof trulaserConditions>

/** Every card of a TruLaser, as a page lays them out. */
export type Cockpit = {
  status: TrulaserStatus
  jobOrder: TrulaserJobOrder
  devices: TrulaserDevices
  technology: TrulaserTechnology
  collision: TrulaserCollision
  conditions: TrulaserConditions
}

/** What a span shows on hover besides its value: another value that held when it began. */
export const spanDetail = z.object({ name: z.string(), value: z.string().nullable() })
export type SpanDetail = z.infer<typeof spanDetail>

/** A stretch of time with one value of a lane. Null where nothing is known. */
export const laneSpan = z.object({
  from: instant,
  to: instant,
  value: z.string().nullable(),
  label: z.string().nullable().describe("What the span is called in the lane, if not its value: the work master."),
  details: z.array(spanDetail).describe("The values of the lane's `details` that held when the span began."),
})
export type LaneSpan = z.infer<typeof laneSpan>

export const lane = z.object({
  key: z.string(),
  group: z.string().nullable().describe("The element of the model or the extension the lane belongs to, on its first lane."),
  label: z.string(),
  topic: z.string().describe("The MQTT topic the values come from; for a lane of events the topic of the events."),
  details: z.array(z.object({ name: z.string(), topic: z.string() })).describe("Where the details of its spans come from."),
  labelFrom: z.string().nullable().describe("The name of the detail a span is called by, if any."),
  overlaps: z.boolean().describe("True for a lane whose spans may overlap: alerts, which stand side by side."),
  spans: z.array(laneSpan).describe("The values between `from` and `to`, oldest first; without a gap unless `overlaps`."),
})
export type Lane = z.infer<typeof lane>

/** Which timelines: of the status, of the job orders, or of the automation devices. */
export const timelineView = z.enum(["status", "jobOrder", "devices"])
export type TimelineView = z.infer<typeof timelineView>

/** How many hours the timelines can look back. */
export const TIMELINE_HOURS = [1, 8, 16, 24] as const
/** How many spans a lane has room for: about one for each pixel of its width. */
export const LANE_SLOTS = 900

/**
 * The timelines of a view: one lane for each value on the same time axis, and when an alert of the category
 * Failure stood. They grow with time: the card asks for them apart from its values.
 */
export const trulaserTimeline = z.object({
  machine: machineId,
  view: timelineView,
  from: instant,
  to: instant,
  lanes: z.array(lane),
  failures: z
    .array(z.object({ from: instant, to: instant, source: z.string() }))
    .describe("When an alert of the category Failure stood, and its SourceName. Never thinned."),
  alertsComplete: z
    .boolean()
    .describe("False if the Events API had more alerts than it returned: then the lanes of the alerts may miss some."),
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

/** A lane as the backend reads it from the Timeseries store: its topic below the machine and its details. */
export type LaneSource = {
  key: string
  group: string | null
  label: string
  path: string
  kind: "text" | "flag"
  details: ReadonlyArray<{ name: string; path: string }>
  labelFrom: string | null
}

const changeCause = [
  { name: "ChangeCause.SignalName", path: SIGNAL_PATHS.changeCauseSignal.path },
  { name: "ChangeCause.SignalValue", path: SIGNAL_PATHS.changeCauseValue.path },
]

/** The lanes of State.Status, with the ChangeCause of the extension on hover. */
export const STATUS_LANES: ReadonlyArray<LaneSource> = [
  { key: "itemState", group: "State.Status", label: "MachineryItemState", path: SIGNAL_PATHS.itemState.path, kind: "text", details: changeCause, labelFrom: null },
  { key: "operationMode", group: null, label: "MachineryOperationMode", path: SIGNAL_PATHS.operationMode.path, kind: "text", details: changeCause, labelFrom: null },
]

/** The lane of WorkMasterMonitoring.ProgramExecution: its State, called by its ActiveWorkMaster. */
export const EXECUTION_LANE: LaneSource = {
  key: "programExecution",
  group: "WorkMasterMonitoring.ProgramExecution",
  label: "State",
  path: SIGNAL_PATHS.executionState.path,
  kind: "text",
  details: [
    { name: "ActiveWorkMaster", path: SIGNAL_PATHS.activeWorkMaster.path },
    { name: "ExecutionId", path: SIGNAL_PATHS.executionId.path },
    { name: "JobOrderID", path: SIGNAL_PATHS.executionJobOrderId.path },
    { name: "StartTime", path: SIGNAL_PATHS.executionStartTime.path },
  ],
  labelFrom: "ActiveWorkMaster",
}

/** The lane of whether any request of the automation is active. */
export const REQUEST_ACTIVE_LANE: LaneSource = {
  key: "deviceRequestActive",
  group: "AutomationDeviceRequestStates",
  label: "DeviceRequestStatusActive",
  path: SIGNAL_PATHS.deviceRequestActive.path,
  kind: "flag",
  details: [],
  labelFrom: null,
}

/** The lane of one automation device: the state of its request, with its error code on hover. */
export function deviceLane(index: number, type: string | null, group: string | null): LaneSource {
  return {
    key: `device${index}`,
    group,
    label: type ?? `Device ${index + 1}`,
    path: `${DEVICES_PATH}/${index}/State`,
    kind: "text",
    details: [{ name: "ErrorCode", path: `${DEVICES_PATH}/${index}/ErrorCode` }],
    labelFrom: null,
  }
}

/** The key of the lane of the alerts of one category. */
export const alertLaneKey = (severity: string) => `alerts${severity}`

/**
 * How long before or after the start of a span a detail may come and still count as the one it began
 * with: the fields of one change come in messages a few milliseconds apart.
 */
export const DETAIL_SLACK_MS = 1000

/**
 * An alert as a span of the lane of its category, from `from` to `to`, called by its source. It carries its
 * id, so whoever keeps the timeline live closes the span when the alert is cleared.
 */
export function alertSpanOf(alert: Pick<Alert, "Id" | "ErrorCode" | "Message" | "Severity" | "SourceName">, from: string, to: string): LaneSpan {
  return {
    from,
    to,
    value: alert.Severity,
    label: alert.SourceName || null,
    details: [
      { name: "ErrorCode", value: alert.ErrorCode || null },
      { name: "Message", value: alert.Message || null },
      { name: "SourceName", value: alert.SourceName || null },
      { name: "AlertId", value: alert.Id },
    ],
  }
}

/** A detail as a person reads it, null if it is empty. A SignalValue with fields a display reads by `signalValueFields`. */
export function detailText(detail: SpanDetail): string | null {
  return detail.value || null
}

/** `HANDLING_LOAD` as `HandlingLoad`, the way the edge component writes the values of its own outputs. */
function pascalOf(snake: string): string {
  return snake
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")
}

/**
 * A value of a message as the edge component writes the values of its outputs: an enumeration
 * `DEVICE_REQUEST_STATE_ACTIVE` without the name of its type, as `Active`. Only an enumeration: a value
 * that begins with the name of its field (`deviceType`: `DEVICE_TYPE_SORTING` is `Sorting`), or, in a
 * field of a state, with a type that ends in `_STATE_`. Any other value, such as a program name
 * `PLL_SHEET_0001` or a serial number, stays as it is.
 */
export function enumText(field: string, value: string): string {
  if (!/^[A-Z][A-Z0-9_]*$/.test(value)) return value
  const type = `${field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}_`
  if (value.startsWith(type) && value.length > type.length) return pascalOf(value.slice(type.length))
  const state = value.indexOf("_STATE_")
  if (/state$/i.test(field) && state > 0) return pascalOf(value.slice(state + "_STATE_".length))
  return value
}

/**
 * The SignalValue of a change cause as named fields, the way a person reads it. A sequence is its
 * SequenceState and BlockingCause. A message that caused the change, such as the request of an
 * automation device, comes as JSON: its fields without its time stamp, enumerations written as the edge
 * component writes them. Null for any other text: it stands as it is.
 */
export function signalValueFields(text: string | null): Array<{ name: string; value: string }> | null {
  if (text === null) return null
  const sequence = sequenceOf(text)
  if (sequence) {
    return [
      { name: "SequenceState", value: sequence.sequenceState },
      { name: "BlockingCause", value: sequence.blockingCause ?? "None" },
    ]
  }
  let message: unknown
  try {
    message = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof message !== "object" || message === null || Array.isArray(message)) return null
  const fields = Object.entries(message).flatMap(([field, value]) => {
    if (field === "utcTimestamp" || !["string", "number", "boolean"].includes(typeof value)) return []
    const name = field.charAt(0).toUpperCase() + field.slice(1)
    return [{ name, value: typeof value === "string" ? enumText(field, value) : String(value) }]
  })
  return fields.length > 0 ? fields : null
}
