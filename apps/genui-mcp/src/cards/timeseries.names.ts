// Names that the time series card shares with its card file. A card file runs in a browser, so this file
// imports nothing.

/** The time series card as a file for other hosts. The example application draws the card itself. */
export const TIMESERIES_CARD_URI = "ui://genui/timeseries"

/** The tool a card asks for the lines of its graph, again when a person changes the range or the lines. */
export const TIMESERIES_SERIES_TOOL = "genui_timeseries_series"

/** The tool a card asks what a person can add: the signals of each machine. */
export const TIMESERIES_SIGNALS_TOOL = "genui_timeseries_signals"
