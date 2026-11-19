export type TextRange = { span: number; start: number; end: number }
export type HighlightRect = { left: number; top: number; width: number; height: number }

/** Match complete passages across PDF.js spans while retaining original UTF-16 offsets. */
export function passageMatches(spans: string[], quote: string): TextRange[][] {
  const needle = quote.replace(/\s+/g, " ").trim().toLowerCase()
  if (!needle) return []
  for (const separator of [" ", ""]) {
    let text = ""
    const positions: Array<{ span: number; at: number } | null> = []
    function append(character: string, position: { span: number; at: number } | null) {
      const normalized = /\s/.test(character) ? " " : character.toLowerCase()
      if (normalized === " " && text.endsWith(" ")) return
      text += normalized
      // Lowercasing can expand a Unicode character; each output unit retains its source offset.
      for (let i = 0; i < normalized.length; i++) positions.push(position)
    }
    spans.forEach((span, index) => {
      if (index && separator) append(separator, null)
      for (let at = 0; at < span.length; at++) append(span[at], { span: index, at })
    })
    const matches: TextRange[][] = []
    for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) {
      const ranges: TextRange[] = []
      for (const position of positions.slice(at, at + needle.length)) {
        if (!position) continue
        const previous = ranges.at(-1)
        if (previous?.span === position.span) previous.end = position.at + 1
        else ranges.push({ span: position.span, start: position.at, end: position.at + 1 })
      }
      if (ranges.length) matches.push(ranges)
    }
    if (matches.length) return matches
  }
  return []
}

/** The evidence chip cites one occurrence; document search can use every occurrence. */
export function passageRanges(spans: string[], quote: string): TextRange[] {
  return passageMatches(spans, quote)[0] ?? []
}

/** Read native text geometry without inserting opaque elements over the PDF glyphs. */
export function highlightRectangles(layer: HTMLElement, quote: string): HighlightRect[] {
  const spans = Array.from(layer.querySelectorAll("span")).filter(span =>
    span.childElementCount === 0 && span.firstChild?.nodeType === 3)
  const matches = passageMatches(spans.map(span => span.textContent ?? ""), quote)
  const origin = layer.getBoundingClientRect()
  return matches.flatMap(match => match.flatMap(part => {
    const node = spans[part.span].firstChild!
    const range = layer.ownerDocument.createRange()
    range.setStart(node, part.start)
    range.setEnd(node, part.end)
    return Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0).map(rect => ({
      left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height,
    }))
  }))
}
