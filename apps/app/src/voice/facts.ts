// An answer of Titan, as the screen shows it next to Titan. The model writes one text (see the
// instructions in chat/assistant.server.ts):
//
//   Drei Maschinen stehen. Am frischesten ist P-07: die Spindel ist zu heiß.
//
//   - **P-07** | Steht | Die Spindel ist zu heiß, die Steuerung hat gestoppt (Alarm 2130). | seit 09:56
//   - **M-02** | Steht | Derselbe Fehler, noch nicht behoben. | seit gestern 20:36
//
//   Übrigens: M-02 hat denselben Fehler seit gestern Abend offen.
//
//   Soll ich dir die Details von M-02 zeigen?
//
// The sentences are said; the list is not read aloud, it is shown as a table. The hint ("Übrigens")
// and the suggestion (the question at the end) are said and shown on their own as well.

/** One line of the list: what it is about, its state in a word, what is going on, since when. */
export type Fact = { title?: string; status?: string; text: string; since?: string }

/** An answer, taken apart for the screen. */
export type Briefing = {
  /** The sentences that answer, without hint and suggestion. */
  summary: string
  facts: Array<Fact>
  /** The one thing nobody asked for, after "Übrigens". */
  hint?: string
  /** The next step Titan offers, as a question. */
  suggestion?: string
}

/** A line of a markdown list, or the start of one. */
const ITEM = /^\s{0,3}[-*+](\s+.*)?$/

/** The text of an answer without its list: what is said. */
export function withoutList(text: string): string {
  return text
    .split("\n")
    .filter((line) => !ITEM.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
}

/** The sentences of a text, each with its mark. */
function sentences(text: string): Array<string> {
  return (text.replace(/\s+/g, " ").match(/[^.!?…]+(?:[.!?…]+["“”»)]*|$)/g) ?? []).map((one) => one.trim()).filter(Boolean)
}

/** One line of the list as a fact: "**Title** | state | text | since", or "**Title**: text". */
export function factOf(line: string): Fact | undefined {
  const content = plain(line.replace(/^\s{0,3}[-*+]\s+/, ""))
  if (!content) return undefined
  if (content.includes("|")) {
    const [title, status, text, since] = content.split("|").map((cell) => cell.trim())
    if (!text) return { text: [title, status].filter(Boolean).join(": ") }
    return { title: title || undefined, status: status || undefined, text, since: since || undefined }
  }
  const titled = /^([^:]{1,40}):\s*(.+)$/.exec(content)
  return titled ? { title: titled[1]?.trim(), text: titled[2]?.trim() ?? "" } : { text: content }
}

/** Takes an answer apart: the summary, the facts of its list, the hint and the suggestion. */
export function briefingOf(text: string): Briefing {
  const facts = text
    .split("\n")
    .filter((line) => /^\s{0,3}[-*+]\s+\S/.test(line))
    .flatMap((line) => {
      const fact = factOf(line)
      return fact ? [fact] : []
    })
  const said = sentences(withoutList(text))
  let hint: string | undefined
  let suggestion: string | undefined
  const summary: Array<string> = []
  for (const [index, sentence] of said.entries()) {
    if (/^übrigens\b/i.test(sentence)) hint = sentence.replace(/^übrigens[:,]?\s*/i, "")
    else if (index === said.length - 1 && sentence.endsWith("?") && index > 0) suggestion = sentence
    else summary.push(sentence)
  }
  return { summary: summary.join(" "), facts, hint, suggestion }
}

/** Without the signs of markdown for emphasis and code. */
function plain(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_~]{1,3}([^*_~|]+?)[*_~]{1,3}/g, "$1")
    .trim()
}
