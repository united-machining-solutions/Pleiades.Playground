// How loud the microphone is, for the bars in the chat field while dictation records: in decibels, as
// the ear hears, so that a quiet voice still moves them and a loud one does not fill them at once.

/** This quiet and quieter is no bar: the noise of a quiet room. */
const QUIET_DB = -60
/** This loud and louder is a full bar: a voice close to the microphone. */
const LOUD_DB = -10

/** The loudness of a block of samples between -1 and 1, from 0 (quiet) to 1 (loud). */
export function loudness(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const sample of samples) sum += sample * sample
  const rms = Math.sqrt(sum / samples.length)
  if (rms === 0) return 0
  const db = 20 * Math.log10(rms)
  return Math.min(1, Math.max(0, (db - QUIET_DB) / (LOUD_DB - QUIET_DB)))
}

/** Minutes and seconds since a recording began, as a clock shows them: 0:07, 1:42. */
export function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
