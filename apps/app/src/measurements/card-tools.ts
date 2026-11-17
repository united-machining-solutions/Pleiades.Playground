// A name the page and the chat of the measurement card share. This file imports nothing.

/**
 * The tool for the lines of the graphs of the measurements. The page "Live values" asks for the
 * lines itself, see get-machines.ts; the chat draws no graph and keeps the tool from its language
 * model, see chat.tsx.
 */
export const MEASUREMENT_SERIES_TOOL = "genui_measurement_series"
