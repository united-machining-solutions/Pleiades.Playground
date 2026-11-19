import type { TimeseriesShow } from "@pleiades/cards/timeseries/contract.ts"
import { TimeseriesCard } from "@pleiades/cards/timeseries/timeseries-card.tsx"
import type { AskSeries, AskSignals } from "@pleiades/cards/timeseries/timeseries-card.tsx"

import { getTimeseriesSeries, getTimeseriesSignals } from "@/machines/get-machines.ts"

// What the card asks for, through the server of the app: the browser never talks to the backend.
const askSeries: AskSeries = (ask) => getTimeseriesSeries({ data: ask })
const askSignals: AskSignals = () => getTimeseriesSignals()

/**
 * The time series card for the values of a tool result, as a chat has it. The result holds no lines,
 * because a language model reads it, so the card asks for them itself, and again when a person
 * changes the range or the lines on it. `bare` draws it without its frame, for a page that puts it
 * into a card of its own.
 */
export function ShownTimeseries({ values, bare = false }: { values: TimeseriesShow; bare?: boolean }) {
  return <TimeseriesCard values={values} askSeries={askSeries} askSignals={askSignals} bare={bare} />
}
