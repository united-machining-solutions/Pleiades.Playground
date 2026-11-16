---
title: "The chat takes its language models from one endpoint, a gateway first"
status: proposed
date: 2026-11-16
---

# ADR-0010: The chat takes its language models from one endpoint, a gateway first

## Context

The chat of the example app had three blocks of settings: Anthropic, OpenAI, and any endpoint that speaks
OpenAI's chat completions. Nine settings named keys, models, defaults and an order between the blocks. A
gateway such as LiteLLM reaches the same providers behind one address and one key, so the same model could
come two ways, and a name in two blocks went to the earlier one without a word. Issue 94 showed that people
filling in `.env` could not tell which lines they needed. At the hackathon every participant has a key of the
hub, a LiteLLM gateway that serves a model in the room and the cloud models.

## Decision

- **One endpoint.** The chat talks to one endpoint that speaks OpenAI's chat completions: `LLM_BASE_URL`,
  `LLM_API_KEY` if it wants one, and `LLM_MODELS`. Dictation names its model at the same endpoint,
  `LLM_TRANSCRIPTION_MODEL`. The blocks of Anthropic and OpenAI are gone, and with them the adapter for
  Anthropic's Messages API.
- **A gateway first.** The documentation leads with a gateway: its address and key are enough.
- **The models come from the endpoint.** With `LLM_MODELS` empty the app offers what `GET /models` lists,
  in its order, and leaves out a model the list marks as not for chat (`mode` other than `chat`) and the
  model of dictation. A model without a mark stays, so a model of one's own behind a gateway is offered too.
- **`LLM_MODELS` narrows.** Named models win over the list: to offer fewer, in another order, and for an
  endpoint that marks nothing, as OpenAI itself and a local model server do.

## Consequences

- One block of four settings instead of three blocks of nine. A participant at the hackathon sets two lines.
- Who wants Anthropic or OpenAI without the hub takes a gateway of their own, or OpenAI itself through the
  one endpoint with `LLM_MODELS`. A `.env` that set only the old blocks gives the chat no model until it is
  changed.
- The app speaks chat completions only. What Anthropic's Messages API or OpenAI's Responses API offer beyond
  that reaches the chat only as far as the gateway translates it.
- The list of models is read once per start of the app; a new model of the gateway needs a restart of `app`.

## Alternatives considered

- **Keep three blocks and only explain them** (the first answer to issue 94): clearer words, the same
  ambiguity between a provider and a gateway that reaches it.
- **A LiteLLM container in the stack**: the app would talk only to it, but every computer would download and
  run a gateway, and at the hackathon there would be one gateway behind another.
- **Filter on `mode: chat` only**: drops a model of one's own that the gateway knows nothing about, the very
  model a gateway in the room is there for.
