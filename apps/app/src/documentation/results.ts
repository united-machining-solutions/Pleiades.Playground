export type DocumentSource = { resourceUri: string; citation: string; pageLabel?: string }

/** Only a revision-specific documentation page can be opened by this host. */
export function pageUri(value: unknown): string {
  if (typeof value !== "string" || !/^docs:\/\/documents\/[a-f0-9]{64}\/[a-f0-9]{64}\/pages\/[1-9][0-9]{0,6}$/.test(value)) {
    throw new Error("Invalid documentation page reference.")
  }
  return value
}
