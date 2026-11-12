import assert from "node:assert/strict"
import { test } from "node:test"

import { serialNumber } from "./contract.ts"

test("a serial number is anything that does not break a topic", () => {
  for (const allowed of ["P-04", "Line 2", "Hall 3 (left)", "M.02_b"]) {
    assert.equal(serialNumber.safeParse(allowed).success, true, allowed)
  }
  // The MQTT binding forbids the level separator and the two wildcards. A machine has a name.
  for (const refused of ["", "a/b", "a+b", "a#b"]) {
    assert.equal(serialNumber.safeParse(refused).success, false, refused)
  }
})
