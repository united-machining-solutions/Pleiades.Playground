import { createHarnessHost, defineHarness } from "@tanstack/ai-harness"
import { createHarnessHandler } from "@tanstack/ai-harness/server"
import { mcp } from "@tanstack/ai-mcp/harness"
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible"
import { memoryPersistence } from "@tanstack/ai-persistence"

// The agent harness of the app. It runs on the server only: the key of the language model stays
// here, and the browser talks to /api/harness.

const instructions = `You help people in a machine shop understand what their machines do.
Read values with the tools and never invent one. If the tools do not give a reason, say that none is recorded.
Answer in a few plain sentences. The app shows the values of a tool call next to your answer, so do not repeat them as a list or a table.`

// The tools of the generative UI backend, under their own names. Created once, shared by all chats.
const tools = mcp({
  servers: {
    genui: {
      type: "http",
      url: process.env.GENUI_MCP_URL ?? "http://localhost:5520/mcp",
      toolName: (tool) => tool.name,
    },
  },
})

let handler: ((request: Request) => Promise<Response>) | undefined

/** The fetch handler of the harness, or null as long as no language model is configured. */
export function harnessHandler() {
  const { LLM_BASE_URL, LLM_MODEL, LLM_API_KEY } = process.env
  if (!LLM_BASE_URL || !LLM_MODEL) return null
  handler ??= createHarnessHandler({
    // Chats live in memory: they are gone when the server restarts.
    host: createHarnessHost({ persistence: memoryPersistence() }),
    harness: defineHarness({
      name: "pleiades/assistant",
      adapter: openaiCompatibleText(LLM_MODEL, {
        baseURL: LLM_BASE_URL,
        apiKey: LLM_API_KEY || "not-needed",
        api: "chat-completions",
      }),
      systemPrompts: [instructions],
      plugins: () => [tools],
    }),
    // The demo has no sign-in: every request runs without a user.
    openAccess: true,
  })
  return handler
}
