// The page of a machine stood at /machines/{machine id} before it moved under Sites. An address
// of then, from a bookmark or a link someone shared, still leads to it.

/**
 * Where an address of the page of a machine from before the move leads: the same machine under
 * Sites, with the same search, the hours of its history and the open chat. `replace` keeps the old
 * address out of the history of the browser.
 *
 * The redirect is temporary, 307, never 301: a browser keeps a permanent one for good, and the
 * addresses of this playground may still move. The app renders in the browser today, so the
 * browser follows it and the server sends no status; the status holds once a route renders on the
 * server.
 */
export function movedMachinePage<TSearch>(machine: string, search: TSearch) {
  return { to: "/sites/$machine", params: { machine }, search, replace: true, statusCode: 307 } as const
}
