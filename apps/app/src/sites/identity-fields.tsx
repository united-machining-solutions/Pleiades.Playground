import { Field, FieldError, FieldGroup } from "@pleiades/ui/components/field"
import { Input } from "@pleiades/ui/components/input"

import type { Identity, IdentityProblems } from "./machine-id.ts"

// What a machine is, in three plain fields side by side: its manufacturer, model and serial number, as the
// data model names them. Narrow, they stand one below the other. Their placeholders name them, and so do
// their labels for a screen reader; a field that is missing says so below it. The id formed from them, where
// one is passed, stands small below, without words around it.

const FIELDS: ReadonlyArray<{ key: keyof Identity; label: string }> = [
  { key: "manufacturer", label: "Manufacturer" },
  { key: "model", label: "Model" },
  { key: "serialNumber", label: "Serial number" },
]

/**
 * The three fields. `problems` are shown at their fields; `machineId` is the id they form, shown quietly
 * below where there is one.
 */
export function IdentityFields({
  id,
  value,
  onChange,
  problems = {},
  machineId,
  disabled = false,
}: {
  id: string
  value: Identity
  onChange: (change: Partial<Identity>) => void
  problems?: IdentityProblems | undefined
  machineId?: string | undefined
  disabled?: boolean | undefined
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FieldGroup className="grid gap-2 sm:grid-cols-3">
        {FIELDS.map(({ key, label }) => (
          <Field key={key} data-invalid={Boolean(problems[key]) || undefined} data-disabled={disabled || undefined}>
            <Input
              id={`${id}-${key}`}
              aria-label={label}
              placeholder={label}
              value={value[key]}
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              aria-invalid={Boolean(problems[key]) || undefined}
              onChange={(event) => onChange({ [key]: event.target.value })}
            />
            {problems[key] && <FieldError>{problems[key]}</FieldError>}
          </Field>
        ))}
      </FieldGroup>
      {machineId && <p className="font-mono text-xs break-all text-muted-foreground">{machineId}</p>}
    </div>
  )
}
