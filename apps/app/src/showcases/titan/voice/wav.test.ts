import assert from "node:assert/strict"
import { test } from "node:test"

import { RECORDING_RATE, wavOf } from "./wav.ts"

test("a recording is a WAV file of one channel and 16 bits, with a header that says how long it is", async () => {
  const second = new Float32Array(RECORDING_RATE).fill(0.5)
  const file = wavOf(second)
  assert.equal(file.type, "audio/wav")
  assert.equal(file.size, 44 + RECORDING_RATE * 2)
  const data = new DataView(await file.arrayBuffer())
  const text = (at: number) => String.fromCharCode(data.getUint8(at), data.getUint8(at + 1), data.getUint8(at + 2), data.getUint8(at + 3))
  assert.deepEqual([text(0), text(8), text(12), text(36)], ["RIFF", "WAVE", "fmt ", "data"])
  assert.equal(data.getUint16(22, true), 1)
  assert.equal(data.getUint32(24, true), RECORDING_RATE)
  assert.equal(data.getUint16(34, true), 16)
  assert.equal(data.getUint32(40, true), RECORDING_RATE * 2)
  // A sample louder than full scale is cut, not wrapped around.
  const loud = new DataView(await wavOf(new Float32Array([2, -2])).arrayBuffer())
  assert.deepEqual([loud.getInt16(44, true), loud.getInt16(46, true)], [0x7fff, -0x7fff])
})
