import type { JobOrderList, MachineShow } from "@pleiades/cards/machine/contract.ts"
import { createServerFn } from "@tanstack/react-start"

import { Refused, ask, textOf } from "@/machines/get-machines.ts"
import type { Answer } from "@/machines/get-machines.ts"

/**
 * The values of the page "Where is My Job?": each machine with the sums of its last hours, without
 * spans (the page asks for the band of the machine it opens), and the job orders on the lists of
 * the machines. Without the job orders the page still stands: they come again from the broker.
 */
export type Floor = {
  asOf: string
  machines: Array<{ show: MachineShow; from: string; spans: null }>
  jobOrders: JobOrderList | null
}

export const getFloor = createServerFn({ method: "GET" }).handler(
  (): Promise<Answer<Floor>> =>
    ask(async (backend) => {
      const [list, jobOrders] = await Promise.all([
        backend.callTool("genui_machine_list", {}),
        backend.callTool("genui_job_order_list", {}),
      ])
      if (list.isError || !list.structuredContent) {
        throw new Refused(textOf(list) ?? "genui_machine_list returned no values.")
      }
      const machines = await Promise.all(
        list.structuredContent.machines.map(async ({ machine }) => {
          const show = await backend.callTool("genui_machine_show", { machine })
          if (show.isError || !show.structuredContent) return null
          return { show: show.structuredContent, from: show.structuredContent.history.to, spans: null }
        }),
      )
      return {
        asOf: list.structuredContent.asOf,
        machines: machines.filter((one) => one !== null),
        jobOrders: jobOrders.isError || !jobOrders.structuredContent ? null : jobOrders.structuredContent,
      }
    }),
)
