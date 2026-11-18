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
 * The tools for the timelines of the TruLaser card and for the values of a tile of its condition
 * guide. Only a card calls them: the app asks for them itself, see get-machines.ts, and the chat
 * keeps them from its language model, see cards/trulaser/chat.tsx.
 */
export const TRULASER_TIMELINE_TOOL = "genui_trulaser_timeline"
export const TRULASER_SERIES_TOOL = "genui_trulaser_series"
