import { createServerFn } from "@tanstack/react-start"

import { callJuiceBar } from "@/juicebar/orders.ts"

// What the page of the juice bar reads: the card of the machine, through the same MCP server the chat has
// (APP_MCP_SERVERS, the entry `juicebar`). No language model is asked: the page is the card itself.

/** The drinks the juice bar can mix now, as `juicebar_drinks_list` gives them, or why there are none. */
export const readDrinks = createServerFn({ method: "GET" }).handler(() => callJuiceBar("juicebar_drinks_list", {}))
