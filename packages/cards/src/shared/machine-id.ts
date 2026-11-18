// Where a machine id may break when the space is narrow. A file of its own, without React, so that
// a test can run it.

/**
 * The parts of a machine id between which a line may break: after each `_`, which separates
 * manufacturer, model and serial number, and nowhere else. alcyone-machines_AX-400_P-04 breaks into
 * alcyone-machines_ | AX-400_ | P-04, never inside AX-400 or P-04.
 */
export function machineIdPieces(id: string): Array<string> {
  return id.split(/(?<=_)/)
}
