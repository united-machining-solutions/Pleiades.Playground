/**
 * A random id in the shape of a UUID (version 4), for a chat, a request and the client of a tab at
 * the broker. `crypto.randomUUID` gives one only in a secure context: HTTPS, or this computer. A
 * page opened over plain HTTP at the address of another computer, as a demo in a local network
 * is, has no such function, and it would neither hear the broker nor begin a chat.
 * `crypto.getRandomValues` is there in both.
 */
export function randomId(random: Pick<Crypto, "getRandomValues"> = crypto): string {
  const bytes = random.getRandomValues(new Uint8Array(16))
  // Version 4 and the variant of RFC 9562, so that whatever reads the id as a UUID takes it.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
