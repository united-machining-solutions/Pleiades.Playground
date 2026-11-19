import { stateLabel } from "@pleiades/cards/machine/state.ts"
import { StateSymbol } from "@pleiades/cards/machine/state-symbol.tsx"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@pleiades/ui/components/combobox"
import { Field, FieldDescription, FieldError, FieldLabel } from "@pleiades/ui/components/field"

import { fieldsOf, matches, whereInWords } from "./choosing.ts"
import type { Candidate } from "./choosing.ts"
import { IdentityFields } from "./identity-fields.tsx"
import type { Identity, IdentityProblems } from "./machine-id.ts"

// "Which machine?" of "Add a machine": one field that finds a machine that sends, or one on a site, which is
// then moved, by its name, manufacturer, state or id. Where what is typed finds none, the machines near it are
// offered, and the three fields of what it is stand below, filled from what was typed where that says
// something; the machine is added without data, its id formed from them.

/**
 * Why the text of the field changes, where it is what a person typed. When the list closes, the Combobox
 * clears a text that is no entry of it ("input-clear"): a machine not in the list is such a text.
 */
const TYPED = new Set(["input-change", "clear-press"])

/** The field, and below it the machine chosen, the machines near what was typed, or the fields of a new one. */
export function OneMachine({
  id,
  candidates,
  query,
  pick,
  identity,
  meant,
  machineId,
  problems,
  missing,
  onQuery,
  onPick,
  onIdentity,
}: {
  id: string
  /** The machines to find: those that send and stand on no site, and those on a site. */
  candidates: ReadonlyArray<Candidate>
  query: string
  pick: Candidate | null
  /** What the machine is, where none was found: shown in the three fields. */
  identity: Identity
  /** The machines near what was typed, offered where it found none. */
  meant: ReadonlyArray<Candidate>
  /** The id the three fields form, shown small below them. */
  machineId: string | undefined
  problems: IdentityProblems
  /** Why the field itself is not done, as a sentence below it. */
  missing: string | undefined
  onQuery: (query: string) => void
  onPick: (pick: Candidate | null) => void
  onIdentity: (change: Partial<Identity>) => void
}) {
  const typed = query.trim()
  const found = pick ? [] : candidates.filter((one) => matches(fieldsOf(one), typed))
  const unknown = pick === null && typed !== "" && found.length === 0
  return (
    <div className="flex flex-col gap-3">
      <Field data-invalid={Boolean(missing) || undefined}>
        <FieldLabel htmlFor={`${id}-which`}>Which machine?</FieldLabel>
        <Combobox
          items={candidates}
          value={pick}
          inputValue={query}
          onInputValueChange={(next: string, details: { reason: string }) => {
            if (!TYPED.has(details.reason)) return
            onQuery(next)
            if (pick !== null) onPick(null)
          }}
          onValueChange={(next: Candidate | null) => {
            onPick(next)
            if (next) onQuery(next.what)
          }}
          itemToStringLabel={(one: Candidate) => one.what}
          itemToStringValue={(one: Candidate) => one.machine}
          isItemEqualToValue={(a: Candidate, b: Candidate) => a.machine === b.machine}
          filter={(one: Candidate, search: string) => matches(fieldsOf(one), search.trim())}
        >
          <ComboboxInput
            id={`${id}-which`}
            className="w-full"
            placeholder="Name, manufacturer or id"
            autoComplete="off"
            aria-invalid={Boolean(missing) || undefined}
          />
          <ComboboxContent>
            <ComboboxEmpty>No machine that sends is called so: say what it is below.</ComboboxEmpty>
            <ComboboxList>
              {(one: Candidate) => (
                <ComboboxItem key={one.machine} value={one}>
                  <StateSymbol state={one.state} />
                  <span className="flex min-w-0 flex-col">
                    <span>{one.what}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {one.standsOn ? `Stands in ${whereInWords(one.standsOn.siteName, one.standsOn.hall)} · ` : ""}
                      {one.machine}
                    </span>
                  </span>
                  {one.standsOn && (
                    <Badge variant="secondary" className="ml-auto">
                      Move
                    </Badge>
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {pick && (
          <FieldDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{stateLabel[pick.state]}</Badge>
            {pick.standsOn ? (
              <>
                <Badge variant="secondary">Move</Badge>
                Stands in {whereInWords(pick.standsOn.siteName, pick.standsOn.hall)} now
              </>
            ) : (
              <span className="break-all">{pick.machine}</span>
            )}
          </FieldDescription>
        )}
        {missing && <FieldError>{missing}</FieldError>}
      </Field>

      {unknown && meant.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Did you mean</span>
          {meant.map((one) => (
            <Button
              key={one.machine}
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                onPick(one)
                onQuery(one.what)
              }}
            >
              {one.what}
            </Button>
          ))}
        </div>
      )}

      {unknown && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm">
            <Badge variant="outline">No data</Badge>
            <span className="text-muted-foreground">What is it?</span>
          </p>
          <IdentityFields id={id} value={identity} onChange={onIdentity} problems={problems} machineId={machineId} />
        </div>
      )}
    </div>
  )
}
