// The messages of the machines in short German, as an operator says them: the screen of Titan speaks
// German, the machines of the demo report in English. A message this list does not know is shown as
// the machine sends it.

const GERMAN: Record<string, string> = {
  "bar feeder empty": "Stangenlader leer",
  "chip conveyor full": "Späneförderer voll",
  "coolant pressure below minimum": "Kühlmitteldruck zu niedrig",
  "coolant pressure low": "Kühlmitteldruck niedrig",
  "door open in automatic mode": "Tür offen im Automatikbetrieb",
  "filter of the coolant clogged": "Kühlmittelfilter verstopft",
  "lubrication interval reached": "Schmierintervall erreicht",
  "measured diameter near tolerance limit": "Durchmesser nahe der Toleranzgrenze",
  "safety door open, machining interrupted": "Schutztür offen, Bearbeitung unterbrochen",
  "spindle drive fault": "Spindelantrieb gestört",
  "tool breakage detected": "Werkzeugbruch",
}

/**
 * A machine as people call it, where there is room for one word: the serial number, the last part of a
 * machine id of the binding. So `alcyone-machines_AX-400_P-04` is "P-04". An id of another shape stays
 * as it is.
 */
export function serialOf(machineId: string): string {
  const parts = machineId.split("_")
  return parts.length === 3 && parts.every(Boolean) ? (parts[2] as string) : machineId
}

/** A message of a machine in short German, if it is a known one. */
export function inGerman(message: string): string {
  return GERMAN[message.trim().toLowerCase()] ?? message
}

/**
 * A machine name such as M-02 is not broken at its hyphen, and a figure not from its unit (12 h,
 * 57 %): they take a hyphen and a space that do not break.
 */
export function unbroken(text: string): string {
  return text.replace(/\b([A-Z]{1,4})-(\d)/g, "$1‑$2").replace(/(\d) (h|min|s|%|Teile?n?)\b/g, "$1 $2")
}
