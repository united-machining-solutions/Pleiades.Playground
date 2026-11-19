import { createServerFn } from "@tanstack/react-start"

import type { Answer } from "@/machines/get-machines.ts"

import type { OsacaSnapshot } from "./contract.ts"

/**
 * The latest values of the OSACA cell. It runs on the server of the app, which listens to the broker:
 * the browser never talks to the broker itself.
 */
export const getOsaca = createServerFn({ method: "GET" }).handler(async (): Promise<Answer<OsacaSnapshot>> => {
  const { readOsaca } = await import("./mqtt.server.ts")
  return readOsaca()
})
