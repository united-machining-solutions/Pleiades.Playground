import type { State } from "@pleiades/cards/machine/contract.ts"
import { MachineCard } from "@pleiades/cards/machine/machine-card.tsx"
import { stateLabel, stateOrder } from "@pleiades/cards/machine/state.ts"
import { StateBand } from "@pleiades/cards/machine/state-band.tsx"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"

import { Example, Section, Topic } from "@/block.tsx"
import { m02Show, m02Spans, p04Show, p04Spans, p07Show, p07Spans } from "@/machine-data.ts"

// What the card catalogue builds from the components, drawn with fixed values in the shape of its
// contract. These are the components themselves, imported from @pleiades/cards: nothing here is a
// copy, and no screen is invented.

export function BuiltFromThese() {
  return (
    <Section
      id="built-from-these"
      line="What this repository builds from the components. The card catalogue, packages/cards, holds what is shown about a machine; the example app builds its pages from the same components and these cards."
    >
      <Topic
        title="Machine card"
        line="What one machine does now, since when, with which program, and what it did over the last hours. A Card with a Badge, the signs of the states and the band below. It draws the result of the tool genui_machine_show and computes nothing but the wording."
      >
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Example title="In alarm" className="block border-0 p-0">
            <MachineCard {...p04Show} spans={p04Spans} />
          </Example>
          <Example title="Running, with an open warning" className="block border-0 p-0">
            <MachineCard {...p07Show} spans={p07Spans} />
          </Example>
          <Example title="Without data: the values are the last known ones" className="block border-0 p-0">
            <MachineCard {...m02Show} spans={m02Spans} />
          </Example>
          <Example title="While the band is on its way: the card stands without it" className="block border-0 p-0">
            <MachineCard {...p04Show} spans={undefined} />
          </Example>
        </div>
      </Topic>

      <Topic
        title="State band"
        line="The states of a machine on a time axis, and below it how long each lasted. Never colour alone: an alarm and missing data are hatched, a stop and setup carry an edge."
      >
        <Example className="block">
          <StateBand history={p04Show.history} spans={p04Spans} />
        </Example>
      </Topic>

      <Topic
        title="State symbols"
        line="The sign of each state, with its own shape. The word stands next to it; where there is no room for the word, the sign carries it for screen readers."
      >
        <Example>
          {[...stateOrder, "warning" as const].map((state: State | "warning") => (
            <span key={state} className="flex items-center gap-1.5 text-sm">
              <StateSymbol state={state} />
              {state === "warning" ? "Warning" : stateLabel[state]}
            </span>
          ))}
        </Example>
      </Topic>
    </Section>
  )
}
