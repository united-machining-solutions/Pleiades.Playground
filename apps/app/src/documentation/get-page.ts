import { createServerFn } from "@tanstack/react-start"
import { pageUri } from "./results.ts"
import { readDocumentPage } from "./read-page.ts"

export const getDocumentPage = createServerFn({ method: "GET" })
  .validator((uri: unknown) => pageUri(uri))
  .handler(({ data }) => readDocumentPage(data))
