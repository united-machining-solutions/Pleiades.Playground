// An answer of Titan, as the screen shows it next to Titan. The model writes one text (see the
// instructions in persona.ts):
//
//   P-04 steht, weil der Spindelantrieb ausgefallen ist.
//   Empfehlung: Ruf die Instandhaltung an P-04.
//
//   - **P-04** | Der Spindelantrieb ist ausgefallen, der Auftrag wartet. | Instandhaltung rufen, Antrieb prüfen.
//
//   Übrigens: P-07 wird gerade eingerichtet.
//
//   Soll ich dir den Verlauf von P-04 zeigen?
//
// The sentences are said: the headline, the recommendation, the hint and the question. The list is
// not read aloud: each line gives the board (titan/board.ts) the problem of a machine in plain words
// and its next step. Every figure on the board comes from the values, not from the model.

/** One line of the list: the machine, its problem in plain words, and the next step. */
export type Fact = { title?: string; text: string; step?: string }

/** An answer, taken apart for the screen. */
export type Briefing = {
  /** The sentences that answer, without recommendation, hint and suggestion. */
  summary: string
  /** What to do, after "Empfehlung:". */
  recommendation?: string
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

/** Each recommendation that was said, in plain letters, with the answer that said it first. */
const saidAdvice = new Map<string, string>()

/**
 * A recommendation is said once: an answer that gives the same again, because the person asked
 * something else, shows it on the screen but does not say it. A recommendation that is still being
 * written is left out until its sentence is complete; the text before it keeps its place.
 */
export function withoutSaidAdvice(text: string, answer: string): string {
  return text.replace(/Empfehlung:[^\n]*?(?:[.!?](?=\s|$)|$)/g, (sentence) => {
    if (!/[.!?]$/.test(sentence)) return ""
    const key = sentence.toLowerCase().replace(/[^a-zäöüß0-9]/g, "")
    const first = saidAdvice.get(key)
    if (first === undefined) saidAdvice.set(key, answer)
    return first === undefined || first === answer ? sentence : ""
  })
}

/** The sentences of a text, each with its mark. */
function sentences(text: string): Array<string> {
  return (text.replace(/\s+/g, " ").match(/[^.!?…]+(?:[.!?…]+["“”»)]*|$)/g) ?? []).map((one) => one.trim()).filter(Boolean)
}

/** One line of the list as a fact: "**Title** | problem | next step", or "**Title**: text". */
export function factOf(line: string): Fact | undefined {
  const content = plain(line.replace(/^\s{0,3}[-*+]\s+/, ""))
  if (!content) return undefined
  if (content.includes("|")) {
    const [title, text, step] = content.split("|").map((cell) => cell.trim())
    if (!text) return { text: title ?? "" }
    return { title: title || undefined, text, step: step || undefined }
  }
  const titled = /^([^:]{1,40}):\s*(.+)$/.exec(content)
  return titled ? { title: titled[1]?.trim(), text: titled[2]?.trim() ?? "" } : { text: content }
}

const RECOMMENDATION = /^empfehlung[:,]?\s*/i
const HINT = /^übrigens[:,]?\s*/i

/** Takes an answer apart: the summary, the recommendation, the facts of its list, the hint and the suggestion. */
export function briefingOf(text: string): Briefing {
  const facts = text
    .split("\n")
    .filter((line) => /^\s{0,3}[-*+]\s+\S/.test(line))
    .flatMap((line) => {
      const fact = factOf(line)
      return fact ? [fact] : []
    })
  const said = sentences(withoutList(text))
  let recommendation: string | undefined
  let hint: string | undefined
  let suggestion: string | undefined
  const summary: Array<string> = []
  for (const [index, sentence] of said.entries()) {
    if (RECOMMENDATION.test(sentence)) recommendation = sentence.replace(RECOMMENDATION, "")
    else if (HINT.test(sentence)) hint = sentence.replace(HINT, "")
    else if (index === said.length - 1 && sentence.endsWith("?") && index > 0) suggestion = sentence
    else summary.push(sentence)
  }
  return { summary: summary.join(" "), recommendation, facts, hint, suggestion }
}

/** Without the signs of markdown for emphasis and code. */
function plain(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")
    .replace(/[*_~]{1,3}([^*_~|]+?)[*_~]{1,3}/g, "$1")
    .trim()
}
