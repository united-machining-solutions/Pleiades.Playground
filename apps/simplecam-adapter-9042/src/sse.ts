// A reader of Server-Sent Events (WHATWG HTML, "Server-sent events"): lines end in CRLF, LF or a lone CR, a blank line
// ends a message, `:` begins a comment.
export interface SseMessage {
  event: string
  data: string
}

/** Takes the text of the stream as it arrives, in chunks cut anywhere, and gives the messages that are whole. */
export function sseParser(): (text: string) => SseMessage[] {
  // A CR at the end of a chunk may be the first half of a CRLF: it waits for the next chunk.
  let carry = ""
  let buffer = ""
  return (text) => {
    let raw = carry + text
    carry = ""
    if (raw.endsWith("\r")) {
      carry = "\r"
      raw = raw.slice(0, -1)
    }
    buffer += raw.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
    const blocks = buffer.split("\n\n")
    buffer = blocks.pop() ?? ""
    const messages: SseMessage[] = []
    for (const block of blocks) {
      let event = "message"
      const data: string[] = []
      for (const line of block.split("\n")) {
        if (line.startsWith(":")) continue
        const colon = line.indexOf(":")
        const field = colon === -1 ? line : line.slice(0, colon)
        const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "")
        if (field === "event") event = value
        else if (field === "data") data.push(value)
      }
      if (data.length > 0) messages.push({ event, data: data.join("\n") })
    }
    return messages
  }
}
