import type { MachineList } from "@pleiades/cards/machine/contract.ts"
import { stateOf } from "@pleiades/cards/machine/state.ts"
import { Card } from "@pleiades/ui/components/card"
import { Fragment } from "react"

import type { ChatTool } from "@/chat/tool-results.ts"
import { ItemGroup, ItemSeparator } from "@pleiades/ui/components/item"

import { SPAN_LIST_TOOL } from "./card-tools.ts"
import { MachineRow } from "./machine-item.tsx"
import { machineListOf, machineShowOf } from "./results.ts"
import { ShownMachine } from "./shown-machine.tsx"

// The machine card in the chat: what a call of each of its tools is called, and what the chat
// draws for a result. chat/cards.tsx lists this module; nothing else in the chat names a machine.

/** The machines of a list, with the same rows as Home. */
function ListedMachines({ values }: { values: MachineList }) {
  return (
    <Card className="gap-0 py-0">
      <ItemGroup className="gap-0">
        {values.machines.map((machine, position) => (
          <Fragment key={machine.machine}>
            {position > 0 && <ItemSeparator className="my-0" />}
            <MachineRow machine={machine} state={stateOf(machine, values.asOf)} asOf={values.asOf} />
          </Fragment>
        ))}
      </ItemGroup>
    </Card>
  )
}

export const machineTools: ReadonlyArray<ChatTool> = [
  {
    name: "genui_machine_show",
    label: {
      running: "Reading the machine",
      done: "Read the machine",
      failed: "Failed to read the machine",
    },
    draw(content) {
      const values = machineShowOf(content)
      return values && <ShownMachine values={values} />
    },
  },
  {
    name: "genui_machine_list",
    label: {
      running: "Reading the machines",
      done: "Read the machines",
      failed: "Failed to read the machines",
    },
    draw(content) {
      const values = machineListOf(content)
      return values && <ListedMachines values={values} />
    },
  },
  // The spans of the band: the card asks for them itself, see get-machines.ts.
  { name: SPAN_LIST_TOOL, cardOnly: true },
]
