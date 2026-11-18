import { stateLabel } from "../machine/state.ts"
import { StateSymbol } from "../machine/state-symbol.tsx"
import type { StateCount } from "./contract.ts"

/**
 * How many machines are in each state, as the backend counted them: the sign, the number and the
 * word, with a word in front where one says whose counts they are. Inside a button, which holds no
 * list, it is made of spans.
 */
export function StateCounts({ counts, label, inButton = false }: { counts: ReadonlyArray<StateCount>; label?: string; inButton?: boolean }) {
  const List = inButton ? "span" : "ul"
  const Entry = inButton ? "span" : "li"
  return (
    <List className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-label={inButton ? undefined : (label ?? "Machines by state")}>
      {label && <Entry className="text-muted-foreground">{label}</Entry>}
      {counts.map(({ state, machines }) => (
        <Entry key={state} className="flex items-center gap-1.5 tabular-nums">
          <StateSymbol state={state} />
          {machines} {stateLabel[state].toLowerCase()}
        </Entry>
      ))}
    </List>
  )
}
