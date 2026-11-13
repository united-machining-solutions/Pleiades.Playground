// A name the pages and the chat of the machine card share. This file imports nothing.

/**
 * The tool for the spans of the band of a machine card. Only a card calls it: the app asks for
 * the spans itself, see get-machines.ts, and the chat keeps the tool from its language model, see
 * chat.tsx.
 */
export const SPAN_LIST_TOOL = "genui_span_list"
