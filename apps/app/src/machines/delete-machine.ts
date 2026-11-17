import { createServerFn } from "@tanstack/react-start"

import { deleteMachineData, invalidSerialNumber } from "./machine-data.ts"

/** The click of the button: deletes the stored data of one machine. */
export const deleteMachine = createServerFn({ method: "POST" })
  .validator((serialNumber: string) => {
    const problem = invalidSerialNumber(serialNumber)
    if (problem) throw new Error(problem)
    return serialNumber
  })
  .handler(({ data: serialNumber }) => deleteMachineData(serialNumber))
