// Fixed series for the charts of the design system page: no value here is read from the backend.
//
// The Timeseries API thins a series out before it is drawn (`downsample`):
// never more points than the picture is wide in pixels. These have 96 points, one for five minutes.

/** A value that looks measured and is the same on every run: no random number. */
function wobble(index: number, seed: number): number {
  const x = Math.sin(index * 12.9898 + seed * 78.233) * 43758.5453
  return x - Math.floor(x) - 0.5
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

/** The bearing temperature of spindle 1 over the last eight hours, in degrees Celsius. */
export const bearingTemperature = Array.from({ length: 96 }, (_, index) => {
  const minutes = 90 + index * 5
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
  // P-04 runs hot towards its alarm at 09:02; P-07 stays in its band.
  const rise = index > 78 ? (index - 78) * 1.3 : 0
  return {
    time,
    p04: round(45 + 6 * Math.sin(index / 9) + wobble(index, 1) * 1.6 + rise),
    p07: round(41 + 4 * Math.sin(index / 11 + 2) + wobble(index, 2) * 1.4),
  }
})

/** The mean active power of P-04 for each of the last eight hours, in kilowatts. */
export const activePower = [3.9, 4.6, 2.1, 4.8, 3.2, 5.1, 4.9, 3.4].map((kilowatts, index) => ({
  hour: `${String(index + 1).padStart(2, "0")}:30`,
  kilowatts,
}))
