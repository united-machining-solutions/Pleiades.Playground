// The categorical colours of the graphs, as dataviz.css names them: `--chart-1` and on. Every card
// that colours a line or a machine takes its colour here, so a change of dataviz.css reaches them all.

/** How many categorical colours dataviz.css names. */
export const COLOURS = 14

/**
 * The colour of a category by its place, from 0: `--chart-1` for the first. After the last the
 * colours begin again.
 */
export function categoryColour(place: number): string {
  return `var(--chart-${(place % COLOURS) + 1})`
}
