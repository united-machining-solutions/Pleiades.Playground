import assert from "node:assert/strict"
import { test } from "node:test"
import {
  activityReadings,
  alertChanges,
  buildManifest,
  cloudEvent,
  extensionPrefix,
  isAlert,
  machineId,
  readingsOf,
  sequenceOf,
  topicOf,
  unavailablePaths,
} from "./binding.ts"

test("the machine id is formed as the binding says", () => {
  assert.equal(machineId("https://www.united-grinding.com", "simplecam", "9042"), "united-grinding_simplecam_9042")
  assert.equal(machineId("https://www.alcyone-machines.example", "AX-400", "P-04"), "alcyone-machines_AX-400_P-04")
  assert.equal(machineId("https://machines.example.co.uk", "AX-400", "P-04"), "machines-example-co_AX-400_P-04")
  assert.equal(machineId("https://müller-maschinen.de", "Schleifer 5/2", "SN 0815#a"), "mueller-maschinen_Schleifer-5-2_SN-0815-a")
  assert.equal(machineId("https://www.trumpf.com", undefined, ""), "trumpf_unknown_unknown")
})

test("every dot of a path is a level; a signal of the manufacturer lies in oem", () => {
  const id = "united-grinding_simplecam_9042"
  assert.equal(topicOf(id, "State.Status"), `machines/${id}/umati/State/Status`)
  assert.equal(topicOf(id, "Connection.State"), `machines/${id}/umati/Connection/State`)
  assert.equal(topicOf(id, "Channel.1.ChannelState"), `machines/${id}/umati/Channel/1/ChannelState`)
  assert.equal(topicOf(id, "x-trumpf-com.WorkMasterMonitoring.ActiveProgram"), `machines/${id}/oem/WorkMasterMonitoring/ActiveProgram`)
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

test("the manifest holds the whole of Core; what the machine lacks is not available", () => {
  const readings = [
    ...readingsOf(full).filter((reading) => !reading.path.startsWith("Connection.")),
    { path: "Identification.ManufacturerUri", value: "https://www.united-grinding.com" },
    { path: "Identification.Model", value: "simplecam" },
  ]
  const manifest = buildManifest("united-grinding_simplecam_9042", "urn:united-grinding:simplecam:9042", readings, 10)
  assert.equal(manifest.modelVersion, "0.17.1")
  assert.deepEqual(manifest.profiles, ["Core"])
  assert.equal(manifest.heartbeatInterval, 10)
  assert.equal(manifest.elements.length, 13)
  assert.deepEqual(unavailablePaths(manifest), [
    "Identification.ProductCode",
    "Identification.YearOfConstruction",
    "State.FeedOverride",
    "OperationCounters.PowerOnDuration",
  ])
  const source = (path: string) => manifest.elements.find((element) => element.path === path)?.timestampSource
  assert.equal(source("State.Status"), "source")
  assert.equal(source("Identification.SerialNumber"), "adapter")
  assert.equal(source("Connection.Heartbeat"), "adapter")
})

test("the manifest names the events of the alert list", () => {
  const manifest = buildManifest("united-grinding_simplecam_9042", "urn:united-grinding:simplecam:9042", [], 10)
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

const PREFIX = "x-united-grinding-com"
const status = (activity: unknown) => ({ path: "State.Status", timestamp: "2026-11-18T14:21:45.671Z", value: { MachineryItemState: "Executing" }, activity })

test("the prefix of the signals is the domain of the manufacturer", () => {
  assert.equal(extensionPrefix("https://www.united-grinding.com"), PREFIX)
  assert.equal(topicOf("united-grinding_simplecam_9042", `${PREFIX}.Activity.Progress`), "machines/united-grinding_simplecam_9042/oem/Activity/Progress")
})

test("the status keeps what the backend says beside it", () => {
  const [reading] = readingsOf(status({ context: "printing", jobName: "spirographBase", progressPercent: 6 }))
  assert.deepEqual(reading.activity, { context: "printing", jobName: "spirographBase", progressPercent: 6 })
  assert.equal(readingsOf(status(undefined))[0].activity, undefined)
})

test("the job is the active work master, how far it is a fraction of one", () => {
  const [reading] = readingsOf(status({ context: "printing", jobName: "spirographBase", progressPercent: 6 }))
  assert.deepEqual(activityReadings(reading, PREFIX), [
    { path: "WorkMasterMonitoring.ActiveWorkMaster", value: "spirographBase", timestamp: "2026-11-18T14:21:45.671Z" },
    { path: `${PREFIX}.Activity.Context`, value: "printing", timestamp: "2026-11-18T14:21:45.671Z" },
    { path: `${PREFIX}.Activity.Progress`, value: 0.06, timestamp: "2026-11-18T14:21:45.671Z", unit: "one" },
  ])
})

test("where the backend says no job, the three are null; progress stays between 0 and 1", () => {
  const [idle] = readingsOf(status(undefined))
  assert.deepEqual(activityReadings(idle, PREFIX).map((reading) => reading.value), [null, null, null])
  const [odd] = readingsOf(status({ jobName: "", progressPercent: "6" }))
  assert.deepEqual(activityReadings(odd, PREFIX).map((reading) => reading.value), [null, null, null])
  const [over] = readingsOf(status({ jobName: "x", progressPercent: 140 }))
  assert.equal(activityReadings(over, PREFIX)[2].value, 1)
  const [under] = readingsOf(status({ jobName: "x", progressPercent: -3 }))
  assert.equal(activityReadings(under, PREFIX)[2].value, 0)
})

test("the manifest says what a signal of the manufacturer is", () => {
  const [reading] = readingsOf(status({ context: "printing", jobName: "spirographBase", progressPercent: 6 }))
  const manifest = buildManifest("united-grinding_simplecam_9042", "urn:united-grinding:simplecam:9042", [reading, ...activityReadings(reading, PREFIX)], 10)
  const element = (path: string) => manifest.elements.find((one) => one.path === path)
  assert.equal(element("WorkMasterMonitoring.ActiveWorkMaster")?.timestampSource, "source")
  assert.deepEqual(element(`${PREFIX}.Activity.Progress`), {
    path: `${PREFIX}.Activity.Progress`,
    timestampSource: "source",
    type: "number",
    unit: { code: "C62", name: "one" },
    description: "Progress of the current job as a fraction, 1.0 = done; null when no job runs",
  })
  assert.equal(element(`${PREFIX}.Activity.Context`)?.type, "string")
  assert.equal(element(`${PREFIX}.Activity.Context`)?.unit, undefined)
})
