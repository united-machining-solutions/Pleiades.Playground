import assert from "node:assert/strict"
import { test } from "node:test"

import { machineId } from "./contract.ts"

test("a machine id is anything that does not break a topic", () => {
  for (const allowed of ["alcyone-machines_AX-400_P-04", "P-04", "Line 2", "Hall 3 (left)", "M.02_b"]) {
    assert.equal(machineId.safeParse(allowed).success, true, allowed)
  }
  // The MQTT binding forbids the level separator and the two wildcards. A machine has a name.
  for (const refused of ["", "a/b", "a+b", "a#b"]) {
    assert.equal(machineId.safeParse(refused).success, false, refused)
  }
})
