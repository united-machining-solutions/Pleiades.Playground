# Titan

Titan is an assistant you talk to: a dark screen with a cloud of points that listens, answers aloud from the
values of the stack, and shows the one thing the answer is about. It is a showcase
([ADR-0018](../../../../../docs/adr/0018-a-showcase-is-built-in-on-request-and-only-adds.md)): only a build
with `APP_SHOWCASES` has the page `/titan`, and nothing outside this folder and its routes knows of it. It
came out of the umati hackathon in November 2026.

## Use it

| | |
|---|---|
| Start | A click or the space bar. A browser speaks and listens only after one of them |
| Ask | Hold the space bar, speak, let go. Or say "Hey Titan" and the question |
| Interrupt | The space bar: Titan falls silent and listens |
| Pause | The key P, or "Hey Titan, Pause". "Hey Titan" or the space bar wakes it |
| Leave | Escape |

Titan also speaks first: when a machine raises a new error it says so, in its own words. It never talks over
the person or over an answer, and says at most one fault a minute; every fault stands in the line on top.

Titan speaks German, as the demo does.

## How a question becomes an answer

1. **Listening.** The browser records while the space bar is held (`voice/voice.ts`), or cuts a piece out of
   the microphone when someone speaks (`voice/wake.ts`), and sends it to
   `routes/(showcases)/titan.api.transcribe.ts`.
2. **"Moment."** Titan says at once that it heard: with the space bar as soon as it is let go, before the
   recording is even recognised, and with "Hey Titan" once the name was recognised.
3. **The turn.** `conversation.ts` sends the conversation to `titan.api.turn.ts`. The server
   (`turn.server.ts`) reads what every machine does now, writes it into Titan's instructions (`persona.ts`)
   and asks the model. Most spoken questions are answered from that, without a tool call. For what goes
   deeper the model has four tools of the generative UI backend (`turn.ts`).
4. **Speaking.** The answer arrives sentence by sentence, and each sentence goes to `titan.api.speak.ts` as
   soon as it is complete, the next one while the first sounds. When the model calls a tool before it said
   anything, Titan says "Ich schaue kurz nach.": a spoken conversation bears a wait that is announced.
5. **The screen.** `voice/shown.ts` takes the answer apart for `focus-view.tsx`, and draws what a tool gave
   with the card the chat of the app draws for the same tool.

The chat of the app is not part of this. Its turn carries every tool and every instruction of the app, about
17 000 tokens, which is right for a chat and too slow to talk to.

## Models: the gateway, and nothing else

Titan takes its three models from the gateway of the chat, `LLM_BASE_URL` with `LLM_API_KEY`
([ADR-0010](../../../../../docs/adr/0010-language-models-through-one-gateway.md)), and has no setting
of its own. `gateway.server.ts` asks `GET /models`:

| For | Mode at the gateway | Which one |
|---|---|---|
| Listening | `audio_transcription` | the model of dictation in the chat |
| The conversation | `chat` | a model named `titan/...`, else the first |
| Speaking | `audio_speech` | a model named `titan/...`, else the first |

A model whose name begins with `titan/` is meant for Titan. That is how Titan gets a voice of its own: the
admin of the gateway adds a speech model, for example `titan/tom`, that points at a service which answers
the speech endpoint of the OpenAI API (`POST /v1/audio/speech`) with `wav`. The voice, and the recording it
was trained on, belong to that service and its operator; nothing of them is in this repository. In the same
way `titan/chat` can name a chat model set up to answer at once: one that does not think first, which for
a Claude model behind LiteLLM is `thinking: {type: disabled}` in its `litellm_params`; `reasoning_effort:
none` did not do it. Without `titan/chat`, Titan asks the first chat model and adds the parameter that keeps
a Haiku or a Qwen model from thinking first. A model that thinks all the same answers after seconds, and a
turn that ends without a word is shown as a problem in the line at the bottom.

Without a transcription model Titan cannot listen, without a chat model it only shows the hall, and without
a speech model it speaks with a voice of the browser that runs on this computer, or stays silent.

This is the one place where the app speaks a third endpoint of the gateway, audio speech; ADR-0010 names
chat completions and audio transcriptions.

## What leaves the room

Everything Titan hears and says goes to the gateway, and from there to wherever its models run:

- With "Hey Titan", every piece of speech the microphone picks up, 0.4 to 8 seconds long, goes to the
  transcription model before the name is recognised, so also what people say next to the screen. With the
  space bar only what is said while it is held.
- The conversation goes to the chat model, the sentences of the answer to the speech model.

Put up a sign where Titan listens in a room, or run a gateway whose models stay in the house.

## Numbers

Measured on a notebook against the gateway of the hackathon, three runs each, the browser on the same
computer. "First sentence" is from the question as text to the first complete sentence of the answer.

| | The chat of the app, with Titan's instructions | Titan's own turn |
|---|---|---|
| First sentence, no tool needed | 1.6 to 1.9 s | 0.9 to 1.9 s |
| First sentence, "which machine stands?" | 1.8 to 5.4 s, one tool call | 0.6 to 1.0 s, no tool call |
| First sentence, energy and alerts of a machine | 2.5 to 7.5 s | 0.9 to 1.2 s, then the tools |
| Tokens of a turn | about 17 500 | about 3 000 |

Recognising a question of two to five seconds took 0.8 to 1.1 s, and a sentence was spoken after 0.04 to
0.3 s. The cloud of points draws 1 400 points in 2 to 3 ms a frame.
