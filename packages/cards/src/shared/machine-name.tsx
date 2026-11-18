import { Fragment } from "react"

import { machineIdPieces } from "./machine-id.ts"

/**
 * A machine id that breaks only after `_`, where the space is narrow: alcyone-machines_AX-400_P-04
 * becomes alcyone-machines_ | AX-400_ | P-04, never a break inside AX-400 or P-04 (machine-id.ts).
 */
export function MachineName({ id }: { id: string }) {
  return (
    <span className="min-w-0 whitespace-normal">
      {machineIdPieces(id).map((piece, index) => (
        <Fragment key={index}>
          {index > 0 && <wbr />}
          {/* No break at the hyphens inside a part. */}
          <span className="whitespace-nowrap">{piece}</span>
        </Fragment>
      ))}
    </span>
  )
}
