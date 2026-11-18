import assert from "node:assert/strict"
import { test } from "node:test"

import { machineIdPieces } from "./machine-id.ts"

test("a machine id breaks only after `_`, never inside a model or a serial number", () => {
  assert.deepEqual(machineIdPieces("alcyone-machines_AX-400_P-04"), ["alcyone-machines_", "AX-400_", "P-04"])
  assert.deepEqual(machineIdPieces("mueller-maschinen_Schleifer-5-2_SN-0815-a"), ["mueller-maschinen_", "Schleifer-5-2_", "SN-0815-a"])
})

test("an id without `_` stays whole, and the parts give the id back", () => {
  assert.deepEqual(machineIdPieces("P-04"), ["P-04"])
  // Two underscores in a row, or one at the end, give no empty piece.
  assert.deepEqual(machineIdPieces("a__b_"), ["a_", "_", "b_"])
  const id = "taygeta-precision_TP-800_P-07"
  assert.equal(machineIdPieces(id).join(""), id)
})
