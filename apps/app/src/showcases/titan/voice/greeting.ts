// What Titan says when it is started: by name if it is given one, and straight to the point if a
// machine stands still with an error.

/** "P-04", "P-04 und P-07", "M-02, P-04 und P-07". */
export function machinesInWords(machines: ReadonlyArray<string>): string {
  if (machines.length <= 1) return machines.join("")
  return `${machines.slice(0, -1).join(", ")} und ${machines.at(-1)}`
}

/** The greeting for a person, by name if known, with the machines that have an open error now. */
export function greetingFor(name: string | undefined, faulty: ReadonlyArray<string>): string {
  const hello = name ? `Hallo ${name}` : "Hallo"
  if (faulty.length > 0) {
    const where = `${faulty.length === 1 ? "an der Maschine" : "an den Maschinen"} ${machinesInWords(faulty)}`
    return name ? `${hello}, du hast ${where} ungeplante Stillstände.` : `${hello}, ${where} gibt es ungeplante Stillstände.`
  }
  return name ? `${hello}, wie kann ich dir helfen?` : `${hello}, wie kann ich helfen?`
}
