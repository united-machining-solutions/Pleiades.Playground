import { written } from "../machine/format.ts"
import { shopfloorShowInWords } from "../shopfloor/in-words.ts"
import type { Block, ViewShow } from "./contract.ts"
import { secondsText, valueText, windowText } from "./format.ts"

// A view in words: what it shows, for a reader that does not see it. A language model reads these
// lines as the result of the tool and can say the values the way the view shows them.

function blockInWords(block: Block): string {
  switch (block.type) {
    case "kpi":
      return `${block.label} (${block.machine ?? "hall"}, ${windowText(block.from, block.to)}): ${valueText(block.value, block.unit)}.`
    case "ranking":
      return `${block.title} (${windowText(block.from, block.to)}): ${block.items.map((one) => `${one.machine} ${valueText(one.value, block.unit)}`).join(", ")}.`
    case "causes":
      return block.items.length === 0
        ? `${block.title} (${windowText(block.from, block.to)}): none.`
        : `${block.title} (${windowText(block.from, block.to)}): ${block.items.map((one) => `${one.title} ${one.count}× (${secondsText(one.seconds)} in total)`).join("; ")}.`
    case "hall":
      return `${block.title}${block.highlight.length > 0 ? `, marked ${block.highlight.join(", ")}` : ""}: ${shopfloorShowInWords(block.shopfloor).split("\n").slice(0, -1).join(" ")}`
    case "note":
      return `Note: ${block.text}`
    case "gaps":
      return `${block.title}. Have: ${block.have.join("; ") || "nothing"}. Missing: ${block.missing.map((one) => `${one.what} (from ${one.source})`).join("; ") || "nothing"}.`
  }
}

export function viewShowInWords(view: ViewShow): string {
  return [`View "${view.title}":`, ...view.blocks.map(blockInWords), `Read at ${written(view.asOf)}.`].join("\n")
}
