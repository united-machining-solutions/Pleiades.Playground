// A name the page and the chat of the measurement card share. This file imports nothing.

/**
 * The tool for the lines of the graphs of the measurements. Only a graph calls it: the app asks
 * for the lines itself, see get-machines.ts, and the chat keeps the tool from its language model,
 * see chat.tsx.
 */
export const MEASUREMENT_SERIES_TOOL = "genui_measurement_series"
