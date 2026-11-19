import { Button } from "@pleiades/ui/components/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@pleiades/ui/components/combobox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@pleiades/ui/components/field"
import { Input } from "@pleiades/ui/components/input"
import { PlusIcon } from "lucide-react"
import { useState } from "react"

import { MAX_TEXT } from "./placing.ts"
import { NO_HALL } from "./choosing.ts"
import type { HallChoice, SiteChoice } from "./choosing.ts"

// Where a machine goes: the site and the hall, two fields that find what is there and make what is not.
// A person types a name; a site or hall of that name is chosen, and a new one is made from it with
// "Create …", its id made from the name when the machine is placed. A new site takes the company the
// sites have; it is asked for only where they differ or there is none yet.

/** One entry of a field: something that is there, or "Create …" with what was typed. */
type Option = { key: string; label: string; hint?: string | undefined; create?: true }

/**
 * A field that finds an entry by its name, and offers to make one of the name typed where none has it.
 * `onChoose` gets the key of an entry, `onCreate` the name typed.
 */
function FindOrCreate({
  id,
  options,
  value,
  onChoose,
  onCreate,
  createInWords,
  placeholder,
  invalid,
  disabled,
}: {
  id: string
  options: ReadonlyArray<Option>
  value: string | null
  onChoose: (key: string) => void
  onCreate: (name: string) => void
  createInWords: (name: string) => string
  placeholder: string
  invalid?: boolean | undefined
  disabled?: boolean | undefined
}) {
  const [query, setQuery] = useState("")
  const typed = query.trim().slice(0, MAX_TEXT)
  // An entry of the name typed is chosen, not made a second time.
  const known = options.some((one) => one.label.toLowerCase() === typed.toLowerCase())
  const items: ReadonlyArray<Option> = typed !== "" && !known ? [...options, { key: `create:${typed}`, label: typed, create: true }] : options
  const chosen = options.find((one) => one.key === value) ?? null
  return (
    <Combobox
      items={items}
      value={chosen}
      onValueChange={(next: Option | null) => {
        if (next === null) return
        if (next.create) onCreate(next.label)
        else onChoose(next.key)
      }}
      onInputValueChange={(next: string) => setQuery(next)}
      itemToStringLabel={(one: Option) => one.label}
      itemToStringValue={(one: Option) => one.key}
      isItemEqualToValue={(a: Option, b: Option) => a.key === b.key}
      // "Create …" stays in the list, whatever is typed; the rest is found by its name or what stands beside it.
      filter={(one: Option, search: string) =>
        one.create === true || `${one.label} ${one.hint ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())
      }
      autoHighlight
      disabled={disabled}
    >
      <ComboboxInput id={id} placeholder={placeholder} className="w-full" aria-invalid={invalid || undefined} disabled={disabled} />
      <ComboboxContent>
        <ComboboxEmpty>Type a name to make a new one.</ComboboxEmpty>
        <ComboboxList>
          {(one: Option) => (
            <ComboboxItem key={one.key} value={one}>
              {one.create ? (
                <>
                  <PlusIcon />
                  {createInWords(one.label)}
                </>
              ) : (
                <>
                  {one.label}
                  {one.hint && <span className="ml-auto text-muted-foreground">{one.hint}</span>}
                </>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const NONE_KEY = "none"
const madeKey = (name: string) => `made:${name}`

/**
 * The two fields side by side, the site and its hall, and under a new site its company. `sites` are those
 * of the list and one a person typed; the hall field waits for a site.
 */
export function PlaceFields({
  id,
  sites,
  site,
  hall,
  company,
  companyKnown,
  onSite,
  onHall,
  onCompany,
  missing,
  hallNeeded = false,
}: {
  id: string
  sites: ReadonlyArray<SiteChoice & { company?: string | undefined }>
  site: SiteChoice | null
  hall: HallChoice
  company: string
  companyKnown: boolean
  onSite: (site: SiteChoice) => void
  onHall: (hall: HallChoice) => void
  onCompany: (company: string) => void
  missing: { site: boolean; company: boolean }
  /** Whether the hall is what the form makes, so it is no option: making a hall of a site that is there. */
  hallNeeded?: boolean | undefined
}) {
  const [changingCompany, setChangingCompany] = useState(false)
  const siteOptions: Array<Option> = sites.map((one) => ({
    key: one.siteId ?? madeKey(one.name),
    label: one.name,
    hint: one.siteId === null ? "new" : one.company,
  }))
  const halls = site?.halls ?? []
  const hallOptions: Array<Option> = [
    { key: NONE_KEY, label: "No hall" },
    ...halls.map((name) => ({ key: name, label: name })),
    ...(hall.made && hall.name !== null ? [{ key: madeKey(hall.name), label: hall.name, hint: "new" }] : []),
  ]
  const siteKey = site === null ? null : (site.siteId ?? madeKey(site.name))
  // No hall shows as the placeholder of an empty field, so a person types a hall without clearing a word first.
  const hallKey = hall.name === null ? null : hall.made ? madeKey(hall.name) : hall.name
  const isNew = site !== null && site.siteId === null
  const askCompany = isNew && (!companyKnown || changingCompany)

  return (
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      <Field data-invalid={missing.site || undefined}>
        <FieldLabel htmlFor={`${id}-site`}>Site</FieldLabel>
        <FindOrCreate
          id={`${id}-site`}
          options={siteOptions}
          value={siteKey}
          placeholder="Find or create a site"
          invalid={missing.site}
          createInWords={(name) => `Create site “${name}”`}
          onChoose={(key) => {
            const next = sites.find((one) => (one.siteId ?? madeKey(one.name)) === key)
            if (next) onSite(next)
          }}
          onCreate={(name) => onSite({ siteId: null, name, halls: [] })}
        />
        {missing.site && <FieldError>Choose a site, or type the name of a new one.</FieldError>}
        {isNew && !askCompany && (
          <FieldDescription>
            New site of {company}.{" "}
            <Button type="button" variant="ghost" size="xs" onClick={() => setChangingCompany(true)}>
              Change company
            </Button>
          </FieldDescription>
        )}
      </Field>
      <Field data-disabled={site === null || undefined}>
        <FieldLabel htmlFor={`${id}-hall`}>
          Hall {!hallNeeded && <span className="font-normal text-muted-foreground">· optional</span>}
        </FieldLabel>
        <FindOrCreate
          id={`${id}-hall`}
          options={hallOptions}
          value={hallKey}
          placeholder="No hall"
          disabled={site === null}
          createInWords={(name) => (site ? `Create hall “${name}” in ${site.name}` : `Create hall “${name}”`)}
          onChoose={(key) => onHall(key === NONE_KEY ? NO_HALL : key === hallKey ? hall : { name: key, made: false })}
          onCreate={(name) => onHall({ name, made: true })}
        />
        {hall.made && <FieldDescription>New hall of {site?.name}.</FieldDescription>}
      </Field>
      {askCompany && (
        <Field data-invalid={missing.company || undefined} className="sm:col-span-2">
          <FieldLabel htmlFor={`${id}-company`}>Company of the new site</FieldLabel>
          <Input
            id={`${id}-company`}
            value={company}
            maxLength={MAX_TEXT}
            onChange={(event) => onCompany(event.target.value)}
            aria-invalid={missing.company || undefined}
          />
          {missing.company && <FieldError>A new site needs a company.</FieldError>}
        </Field>
      )}
    </FieldGroup>
  )
}
