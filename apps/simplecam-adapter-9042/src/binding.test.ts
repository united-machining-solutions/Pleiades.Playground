import assert from "node:assert/strict"
import { test } from "node:test"
import {
  activityReadings,
  alertChanges,
  buildManifest,
  canonical,
  cloudEvent,
  defaultProductInstanceUri,
  deliveredElements,
  extensionPrefix,
  identityReadings,
  isAlert,
  machineId,
  readingsOf,
  sequenceOf,
  topicOf,
  unavailablePaths,
} from "./binding.ts"

const PREFIX = "x-united-grinding-com"
const ID = "united-grinding_simplecam_9042"

test("the machine id is formed as the binding says", () => {
  assert.equal(machineId("https://www.united-grinding.com", "simplecam", "9042"), ID)
  assert.equal(machineId("https://www.alcyone-machines.example", "AX-400", "P-04"), "alcyone-machines_AX-400_P-04")
  assert.equal(machineId("https://machines.example.co.uk", "AX-400", "P-04"), "machines-example-co_AX-400_P-04")
  assert.equal(machineId("https://müller-maschinen.de", "Schleifer 5/2", "SN 0815#a"), "mueller-maschinen_Schleifer-5-2_SN-0815-a")
  assert.equal(machineId("https://www.trumpf.com", undefined, ""), "trumpf_unknown_unknown")
})

test("every dot of a path is a level; a signal of the manufacturer lies in oem", () => {
  assert.equal(topicOf(ID, "State.Status"), `machines/${ID}/umati/State/Status`)
  assert.equal(topicOf(ID, "Connection.State"), `machines/${ID}/umati/Connection/State`)
  assert.equal(topicOf(ID, "Channel.1.ChannelState"), `machines/${ID}/umati/Channel/1/ChannelState`)
  assert.equal(topicOf(ID, "x-trumpf-com.WorkMasterMonitoring.ActiveProgram"), `machines/${ID}/oem/WorkMasterMonitoring/ActiveProgram`)
  assert.equal(topicOf(ID, `${PREFIX}.Activity.Progress`), `machines/${ID}/oem/Activity/Progress`)
})

const full = {
  connection: {
    heartbeat: { path: "Connection.Heartbeat", timestamp: "2026-11-18T14:00:31.768Z", value: 125 },
    state: { path: "Connection.State", timestamp: "2026-11-18T13:39:41.768Z", value: "Connected" },
  },
  identification: { Manufacturer: "United Grinding", ProductInstanceUri: "urn:united-grinding:simplecam:9042", SerialNumber: "9042" },
  notification: { activeAlerts: { path: "Notification.ActiveAlerts", timestamp: "2026-11-18T13:39:41.768Z", value: [] } },
  state: {
    status: {
      activity: { context: "printing", jobName: "spirographGear11", progressPercent: 100 },
      path: "State.Status",
      timestamp: "2026-11-18T14:00:20.421Z",
      value: { MachineryItemState: "Executing", MachineryOperationMode: "Processing" },
    },
  },
}

test("a whole state of the stream gives its elements, and only value, path and timestamp are read", () => {
  const readings = readingsOf(full)
  assert.deepEqual(
    readings.map((reading) => reading.path).sort(),
    [
      "Connection.Heartbeat",
      "Connection.State",
      "Identification.Manufacturer",
      "Identification.ProductInstanceUri",
      "Identification.SerialNumber",
      "Notification.ActiveAlerts",
      "State.Status",
    ],
  )
  const status = readings.find((reading) => reading.path === "State.Status")
  assert.deepEqual(status?.value, { MachineryItemState: "Executing", MachineryOperationMode: "Processing" })
  assert.equal(status?.timestamp, "2026-11-18T14:00:20.421Z")
  assert.equal(readings.find((reading) => reading.path === "Identification.SerialNumber")?.timestamp, undefined)
})

test("one element of the stream is one reading", () => {
  assert.deepEqual(readingsOf({ path: "Connection.Heartbeat", timestamp: "2026-11-18T14:00:41.768Z", value: 126 }), [
    { path: "Connection.Heartbeat", value: 126, timestamp: "2026-11-18T14:00:41.768Z" },
  ])
  assert.deepEqual(readingsOf("nothing"), [])
})

test("the settings give the identification the adapter knows at its start", () => {
  const uri = defaultProductInstanceUri("https://www.united-grinding.com/", "simple cam", "9042")
  assert.equal(uri, "https://www.united-grinding.com/simple%20cam/9042")
  const readings = identityReadings({
    manufacturer: "United Grinding",
    manufacturerUri: "https://www.united-grinding.com",
    model: "simplecam",
    serialNumber: "9042",
    productInstanceUri: uri,
  })
  assert.deepEqual(
    readings.map((reading) => reading.path),
    [
      "Identification.Manufacturer",
      "Identification.SerialNumber",
      "Identification.ProductInstanceUri",
      "Identification.ManufacturerUri",
      "Identification.Model",
    ],
  )
  assert.equal(readings.every((reading) => reading.timestamp === undefined), true)
})

test("the manifest holds the whole of Core before the stream has said anything", () => {
  const manifest = buildManifest(ID, "urn:united-grinding:simplecam:9042", deliveredElements(PREFIX), 10)
  assert.equal(manifest.modelVersion, "0.17.1")
  assert.deepEqual(manifest.profiles, ["Core"])
  assert.equal(manifest.heartbeatInterval, 10)
  assert.equal(manifest.elements.length, 16)
  // An element that has not come yet is no "not available": only what the machine lacks for good is.
  assert.deepEqual(unavailablePaths(manifest), [
    "Identification.ProductCode",
    "Identification.YearOfConstruction",
    "State.FeedOverride",
    "OperationCounters.PowerOnDuration",
  ])
  const source = (path: string) => manifest.elements.find((element) => element.path === path)?.timestampSource
  assert.equal(source("State.Status"), "source")
  assert.equal(source("Notification.ActiveAlerts"), "source")
  assert.equal(source("Identification.SerialNumber"), "adapter")
  assert.equal(source("Connection.Heartbeat"), "adapter")
  assert.equal(source("WorkMasterMonitoring.ActiveWorkMaster"), "adapter")
})

test("an element the stream adds is named by the manifest", () => {
  const manifest = buildManifest(ID, "urn", [...deliveredElements(PREFIX), { path: "Identification.ProductCode", timestampSource: "source" }, { path: "Channel.1.ChannelState", timestampSource: "source" }], 10)
  assert.equal(unavailablePaths(manifest).includes("Identification.ProductCode"), false)
  assert.equal(manifest.elements.some((element) => element.path === "Channel.1.ChannelState"), true)
})

test("the manifest names the events of the alert list", () => {
  const manifest = buildManifest(ID, "urn:united-grinding:simplecam:9042", [], 10)
  assert.deepEqual(manifest.events, [
    { path: "Notification.AlertRaised" },
    { path: "Notification.AlertChanged" },
    { path: "Notification.AlertCleared" },
  ])
})

const overheat = { Id: "A-1", ErrorCode: "E100", Message: "Overheat", Severity: "Failure", SeverityValue: 900, Time: "2026-11-18T09:00:00.000Z", SourceName: "Spindle" }
const door = { Id: 2, ErrorCode: "E200", Message: "Door open", Severity: "OffSpec", SeverityValue: 500, Time: "2026-11-18T09:05:00.000Z", SourceName: "Door" }

test("an entry is raised, changed or cleared; the first list raises every entry", () => {
  assert.deepEqual(alertChanges(null, []), [])
  assert.deepEqual(alertChanges(null, [overheat, door]).map((change) => change.type), ["Notification.AlertRaised", "Notification.AlertRaised"])
  assert.deepEqual(alertChanges([overheat], [overheat]), [])
  assert.deepEqual(alertChanges([], [overheat]), [{ type: "Notification.AlertRaised", alert: overheat }])
  const worse = { ...overheat, SeverityValue: 950 }
  assert.deepEqual(alertChanges([overheat], [worse]), [{ type: "Notification.AlertChanged", alert: worse }])
  assert.deepEqual(alertChanges([overheat, door], [door]), [{ type: "Notification.AlertCleared", alert: overheat }])
})

test("the same alert with its fields in another order has not changed", () => {
  const reordered = { SourceName: "Spindle", Time: overheat.Time, SeverityValue: 900, Severity: "Failure", Message: "Overheat", ErrorCode: "E100", Id: "A-1" }
  assert.deepEqual(alertChanges([overheat], [reordered]), [])
  assert.equal(canonical({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } }), canonical({ a: { c: null, d: [2, { x: 2, y: 1 }] }, b: 1 }))
  assert.notEqual(canonical({ a: 1 }), canonical({ a: "1" }))
})

test("the number 2 and the text 2 are two alerts", () => {
  const number = { ...door, Id: 2 }
  const text = { ...door, Id: "2" }
  assert.deepEqual(alertChanges([number], [text]).map((change) => change.type), ["Notification.AlertRaised", "Notification.AlertCleared"])
})

test("only an object with an Id is an alert", () => {
  assert.equal(isAlert(overheat), true)
  assert.equal(isAlert(door), true)
  assert.equal(isAlert({ Message: "no id" }), false)
  assert.equal(isAlert(null), false)
  assert.equal(isAlert("A-1"), false)
})

test("the sequence is the start of the adapter and a count of twelve digits", () => {
  const start = new Date("2026-11-18T14:03:41.490Z")
  assert.equal(sequenceOf(start, 1), "20261118T140341Z.000000000001")
  assert.equal(sequenceOf(start, 1842), "20261118T140341Z.000000001842")
})

test("an event is a CloudEvent 1.0 with the schema of the model version", () => {
  const event = cloudEvent({
    id: "0f4c4a51-8e2b-4d6a-9c1f-4b7e2d913a60",
    source: "urn:united-grinding:simplecam:9042",
    type: "Notification.AlertRaised",
    time: overheat.Time,
    sequence: sequenceOf(new Date("2026-11-18T14:03:41.490Z"), 1),
    data: overheat,
  })
  assert.deepEqual(event, {
    specversion: "1.0",
    id: "0f4c4a51-8e2b-4d6a-9c1f-4b7e2d913a60",
    source: "urn:united-grinding:simplecam:9042",
    type: "Notification.AlertRaised",
    time: "2026-11-18T09:00:00.000Z",
    sequence: "20261118T140341Z.000000000001",
    dataschema: "urn:umati2:datamodel:0.17.1:event.schema.json",
    data: overheat,
  })
})

const status = (activity: unknown) => ({ path: "State.Status", timestamp: "2026-11-18T14:21:45.671Z", value: { MachineryItemState: "Executing" }, activity })
const READ = "2026-11-18T14:25:00.000Z"

test("the prefix of the signals is the domain of the manufacturer", () => {
  assert.equal(extensionPrefix("https://www.united-grinding.com"), PREFIX)
})

test("the status keeps what the backend says beside it", () => {
  const [reading] = readingsOf(status({ context: "printing", jobName: "spirographBase", progressPercent: 6 }))
  assert.deepEqual(reading.activity, { context: "printing", jobName: "spirographBase", progressPercent: 6 })
  assert.equal(readingsOf(status(undefined))[0].activity, undefined)
})

test("the job is the active work master, how far it is a fraction of one, both with the time they were read", () => {
  const [reading] = readingsOf(status({ context: "printing", jobName: "spirographBase", progressPercent: 6 }))
  assert.deepEqual(activityReadings(reading, PREFIX, READ), [
    { path: "WorkMasterMonitoring.ActiveWorkMaster", value: "spirographBase", timestamp: READ },
    { path: `${PREFIX}.Activity.Context`, value: "printing", timestamp: READ },
    { path: `${PREFIX}.Activity.Progress`, value: 0.06, timestamp: READ, unit: "one" },
  ])
})

test("where the backend says no job, the three are null; progress stays between 0 and 1", () => {
  const [idle] = readingsOf(status(undefined))
  assert.deepEqual(activityReadings(idle, PREFIX, READ).map((reading) => reading.value), [null, null, null])
  const [odd] = readingsOf(status({ jobName: "", progressPercent: "6" }))
  assert.deepEqual(activityReadings(odd, PREFIX, READ).map((reading) => reading.value), [null, null, null])
  const [over] = readingsOf(status({ jobName: "x", progressPercent: 140 }))
  assert.equal(activityReadings(over, PREFIX, READ)[2].value, 1)
  const [under] = readingsOf(status({ jobName: "x", progressPercent: -3 }))
  assert.equal(activityReadings(under, PREFIX, READ)[2].value, 0)
})

test("the manifest says what a signal of the manufacturer is", () => {
  const manifest = buildManifest(ID, "urn:united-grinding:simplecam:9042", deliveredElements(PREFIX), 10)
  const element = (path: string) => manifest.elements.find((one) => one.path === path)
  assert.deepEqual(element(`${PREFIX}.Activity.Progress`), {
    path: `${PREFIX}.Activity.Progress`,
    timestampSource: "adapter",
    type: "number",
    unit: { code: "C62", name: "one" },
    description: "Progress of the current job as a fraction, 1.0 = done; null when no job runs",
  })
  assert.equal(element(`${PREFIX}.Activity.Context`)?.type, "string")
  assert.equal(element(`${PREFIX}.Activity.Context`)?.unit, undefined)
})
