// What a chat is called. The harness keeps the name; the app gives it, after the first turn, from the
// first question (`nameOfQuestion`), and the head of the panel shows it (`chatName`).

/** What the list and the head call a chat the harness has no name for yet. */
export const UNNAMED_CHAT = "New chat"

/** The longest name of a chat, in characters. */
export const MAX_CHAT_NAME = 80

/** The name a chat gets from its first question. */
export function nameOfQuestion(question: string): string {
  return question.slice(0, MAX_CHAT_NAME)
}

/**
 * What the head of the panel says in a chat. The name the app has given it, once there is one. Until
 * then, with the first question on its way to the harness, that question: it is what the name will be,
 * so nothing changes when the name arrives. A chat with no question yet is `UNNAMED_CHAT`.
 */
export function chatName(
  entry: { title: string; titled: boolean } | undefined,
  firstQuestion: string | undefined,
): string {
  if (entry?.titled) return entry.title
  if (firstQuestion) return nameOfQuestion(firstQuestion)
  return UNNAMED_CHAT
}
