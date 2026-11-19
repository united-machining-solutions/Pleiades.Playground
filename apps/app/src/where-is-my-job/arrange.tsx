import type { Machine } from "@pleiades/cards/machine/contract.ts"
import { titleOf } from "@pleiades/cards/machine/in-words.ts"
import { Badge } from "@pleiades/ui/components/badge"
import { Button } from "@pleiades/ui/components/button"
import { NativeSelect, NativeSelectOption } from "@pleiades/ui/components/native-select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@pleiades/ui/components/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@pleiades/ui/components/table"
import { LayoutGridIcon } from "lucide-react"
import { useState } from "react"

import { NO_STEP, STEPS, rankOf, stepOf } from "./steps.ts"
import type { StepId, StepSettings, StepSource } from "./steps.ts"

const sourceLabel: Record<StepSource, string> = {
  deviceClass: "device class",
  model: "from model",
  person: "set here",
  none: "unknown",
}

/**
 * Arrange the shop floor: each machine with what it says it is and the step that follows from it.
 * Where that is wrong or missing, a person sets the step; what they set wins. It is kept in this
 * browser only.
 */
export function Arrange({
  machines,
  settings,
  onSave,
}: {
  machines: ReadonlyArray<Machine>
  settings: StepSettings
  onSave: (next: StepSettings) => void
}) {
  const [draft, setDraft] = useState<StepSettings>(settings)
  // By the steps as saved, so a row does not jump away while a person chooses.
  const rows = [...machines].sort(
    (a, b) =>
      rankOf(stepOf(a.identity, settings[a.machine]).id) - rankOf(stepOf(b.identity, settings[b.machine]).id) ||
      titleOf(a).localeCompare(titleOf(b)),
  )

  // A choice equal to what follows from the machine is no setting.
  const choose = (machine: Machine, value: string) => {
    const { [machine.machine]: _dropped, ...rest } = draft
    const derived = stepOf(machine.identity, undefined).id
    setDraft(value === derived ? rest : { ...rest, [machine.machine]: value as StepId | "none" })
  }

  return (
    <Sheet onOpenChange={(open) => open && setDraft(settings)}>
      <SheetTrigger render={<Button variant="outline" size="sm" />}>
        <LayoutGridIcon data-icon="inline-start" />
        Arrange
      </SheetTrigger>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Arrange the shop floor</SheetTitle>
          <SheetDescription>
            Each machine gets its step from what it says it is. Where that is wrong or missing, set it here: what you set
            wins. It is kept in this browser.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Machine</TableHead>
                <TableHead>Says it is</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>From</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((machine) => {
                const step = stepOf(machine.identity, draft[machine.machine])
                const says = machine.identity.deviceClass ?? (machine.identity.model ? `model ${machine.identity.model}` : "no identification")
                return (
                  <TableRow key={machine.machine}>
                    <TableCell className="font-medium">{titleOf(machine)}</TableCell>
                    <TableCell className={machine.identity.deviceClass ? undefined : "text-muted-foreground"}>{says}</TableCell>
                    <TableCell>
                      <NativeSelect
                        size="sm"
                        value={step.id}
                        aria-label={`Step of ${titleOf(machine)}`}
                        onChange={(event) => choose(machine, event.target.value)}
                      >
                        {STEPS.map((one) => (
                          <NativeSelectOption key={one.id} value={one.id}>
                            {one.name}
                          </NativeSelectOption>
                        ))}
                        <NativeSelectOption value={NO_STEP.id}>{NO_STEP.name}</NativeSelectOption>
                      </NativeSelect>
                    </TableCell>
                    <TableCell>
                      <Badge variant={step.source === "none" ? "secondary" : "outline"}>{sourceLabel[step.source]}</Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <p className="py-4 text-xs text-muted-foreground">
            The rule: the device class first (lathe → Turning, machining centre → Milling, grinding machine → Grinding),
            else words of the model (laser, punch, tube → Cutting; Ultimaker → Printing). The steps stand in the order of
            DIN 8580: printing, then cutting, turning, milling, grinding, then forming and joining. Machines of one step
            stand side by side.
          </p>
        </div>
        <SheetFooter className="flex-row justify-end">
          <Button variant="outline" onClick={() => setDraft({})} disabled={Object.keys(draft).length === 0}>
            Back to derived
          </Button>
          <SheetClose render={<Button />} onClick={() => onSave(draft)}>
            Save
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
