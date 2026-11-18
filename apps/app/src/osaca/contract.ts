/** One value of the cell as it came over MQTT: the value envelope of the binding. */
export type OemValue = { value: number | string | boolean | null; unit?: string; timestamp?: string }

/** A value of the data model as JSON: a number, a text, a snapshot like `State.Status`, or a list. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

/** One value of the umati data model, below `<root>/umati/<path>`: the same envelope, with any JSON value. */
export type ModelValue = { value: Json; unit?: string; timestamp?: string; correlationId?: string }

/** What the server of the app knows about the OSACA cell at one moment. */
export type OsacaSnapshot = {
  /** The broker the server listens to, and the topics it subscribed. */
  broker: string
  topic: string
  /** Whether the server is connected to the broker right now. The values stay while it reconnects. */
  connected: boolean
  /** The root of the cell, e.g. `machines/isw_osaca2`; null while no cell has published. */
  root: string | null
  /** When the last value of the cell arrived, ISO 8601; null while nothing has arrived. */
  received: string | null
  /** The latest value per path below `<root>/oem`, e.g. `Drive/OsakaX/ActualPosition`. */
  values: Record<string, OemValue>
  /** The latest value per path below `<root>/umati`, e.g. `State/Status`; empty until the cell has sent them. */
  umati: Record<string, ModelValue>
}
