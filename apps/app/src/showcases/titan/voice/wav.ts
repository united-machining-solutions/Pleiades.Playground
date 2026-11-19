// A recording as a WAV file, written in the page: what Titan sends to the transcription model, for the
// space bar (voice.ts) and for "Hey Titan" (wake.ts). Every endpoint of transcription reads it, whatever
// the browser.

/** The samples a second of a recording: enough for speech, and what the models take. */
export const RECORDING_RATE = 16_000

/** One channel at 16 kHz as a WAV file of 16 bits, which every endpoint of transcription reads. */
export function wavOf(samples: Float32Array, rate = RECORDING_RATE): Blob {
  const data = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const text = (at: number, value: string) => [...value].forEach((sign, index) => data.setUint8(at + index, sign.charCodeAt(0)))
  text(0, "RIFF")
  data.setUint32(4, 36 + samples.length * 2, true)
  text(8, "WAVE")
  text(12, "fmt ")
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, 1, true)
  data.setUint32(24, rate, true)
  data.setUint32(28, rate * 2, true)
  data.setUint16(32, 2, true)
  data.setUint16(34, 16, true)
  text(36, "data")
  data.setUint32(40, samples.length * 2, true)
  samples.forEach((sample, index) => data.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true))
  return new Blob([data.buffer], { type: "audio/wav" })
}
