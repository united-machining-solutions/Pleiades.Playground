---
title: "The chat takes its language models from a LiteLLM gateway"
status: proposed
date: 2026-11-16
---

# ADR-0010: The chat takes its language models from a LiteLLM gateway

## Context

The chat of the example app had three blocks of settings: Anthropic, OpenAI, and any endpoint that speaks
OpenAI's chat completions. Nine settings named keys, models, defaults and an order between the blocks. A
gateway such as LiteLLM reaches the same providers behind one address and one key, so the same model could
come two ways, and a name in two blocks went to the earlier one without a word. Issue 94 showed that people
filling in `.env` could not tell which lines they needed. At the hackathon every participant has a key of the
hub, a LiteLLM gateway that serves a model in the room, the cloud models, and a speech-to-text model.

## Decision

- **A LiteLLM gateway, and nothing else.** The app has two settings: `LLM_BASE_URL` and `LLM_API_KEY`. The
  blocks of Anthropic and OpenAI are gone, with the adapter for Anthropic's Messages API, and so are
  `LLM_MODELS` and `LLM_TRANSCRIPTION_MODEL`.
- **The models come from the gateway.** The app reads `GET /models` and takes the order of the list. LiteLLM
  says of each model what it is for (`mode`). The chat offers the models for `chat` and those without a mode;
  dictation takes the first model for `audio_transcription`; every other mode is left out.
- **What is offered is decided at the gateway.** Which models a key sees, and in which order, is set there,
  not in the app.
- **One snapshot.** The harness, dictation and the chat panel read the same list. A list with a model for
  chat is kept until the app restarts; one that did not come is asked for again after half a minute, and the
  panel names the cause.

## Consequences

- Two settings instead of nine. A participant at the hackathon sets the address and the key of the hub.
- Who wants Anthropic or OpenAI without the hub starts the stack's own LiteLLM gateway, with the profile
  `gateway` and the key of the provider in `.env`. A `.env` that set only the old settings gives the chat no
  model until it is changed.
- The app speaks chat completions and audio transcriptions only. What Anthropic's Messages API or OpenAI's
  Responses API offer beyond that reaches the chat only as far as LiteLLM translates it.
- A model of one's own without a mode counts as a chat model. A model of one's own that is not for chat needs
  its mode at the gateway, or it appears in the chat.
- A new model at the gateway needs a restart of `app`.

## Alternatives considered

- **Keep three blocks and only explain them** (the first answer to issue 94): clearer words, the same
  ambiguity between a provider and a gateway that reaches it.
- **One endpoint of any kind, with `LLM_MODELS` and `LLM_TRANSCRIPTION_MODEL` to name models**: needed for
  endpoints that do not say what a model is for, such as OpenAI itself or Ollama, but at the hackathon it is
  one more line to get wrong, and the gateway already decides what a key may use.
- **A LiteLLM container in the stack, always on**: every computer would download and run a gateway, and at the
  hackathon there would be one gateway behind another. Behind the profile `gateway` it starts only where
  there is no other.
- **Filter on `mode: chat` only**: drops a model of one's own that the gateway knows nothing about, the very
  model a gateway in the room is there for.
