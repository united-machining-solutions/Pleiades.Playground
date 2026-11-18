import assert from "node:assert/strict"
import { test } from "node:test"
import { buildManifest, machineId, readingsOf, topicOf, unavailablePaths } from "./binding.ts"

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
