// Names the pages and the chat of the cards share. This file imports nothing.

/**
 * The tool for the spans of the band of a machine card. Only a card calls it: the app asks for
 * the spans itself, see get-machines.ts, and the chat keeps the tool from its language model, see
 * cards/machine/chat.tsx.
 */
export const SPAN_LIST_TOOL = "genui_span_list"

/**
 * The tool for the lines of the graphs of the measurements. Only a card calls it: the page "Live
 * values" asks for the lines itself, see get-machines.ts, and the chat keeps the tool from its
 * language model, see cards/measurement/chat.tsx.
 */
export const MEASUREMENT_SERIES_TOOL = "genui_measurement_series"

/**
 * The tool for the lines of the graph of the energy card. Only a card calls it: the chat asks for
 * the lines itself, see get-machines.ts, and keeps the tool from its language model, see
 * cards/energy/chat.tsx.
 */
export const ENERGY_SERIES_TOOL = "genui_energy_series"

/**
 * The tools for the lines of a time series card and for what a person can add to it. Only a card calls
 * them: the chat asks for them itself, see get-machines.ts, and keeps them from its language model,
 * see cards/timeseries/chat.tsx.
 */
export const TIMESERIES_SERIES_TOOL = "genui_timeseries_series"
export const TIMESERIES_SIGNALS_TOOL = "genui_timeseries_signals"
