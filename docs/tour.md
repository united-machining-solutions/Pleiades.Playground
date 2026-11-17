# A tour of the demo

Six stops through the running demo, for someone who has never seen it: what you see, and where it lives in
the code. The screenshots were taken from the demo stack on one computer; your machines will be in other
states, because the simulator keeps changing them.

With a coding agent in the repository you can ask for this tour: "give me a tour". The agent then walks you
through the stops in your running stack, see [`AGENTS.md`](../AGENTS.md).

1. [Start](#1-start)
2. [Home](#2-home)
3. [The page of one machine](#3-the-page-of-one-machine)
4. [The chat beside the page](#4-the-chat-beside-the-page)
5. [When a machine goes silent](#5-when-a-machine-goes-silent)
6. [Where to change what](#6-where-to-change-what)

## 1. Start

One command builds and starts everything. It needs Docker and nothing else, see the
[development setup](development-setup.md).

```bash
docker compose up -d --build --wait
```

The command returns when the stack is ready, that is when every container reports healthy: the broker, the
database, the two APIs with their persistence workers, the generative UI backend, the app and one simulator
per machine. To see the demo without building it, start it from the published images, see
[Start](../README.md#start).

```bash
docker compose ps --format "table {{.Service}}	{{.Status}}"
```

```text
SERVICE                  STATUS
app                      Up 3 minutes (healthy)
broker                   Up 3 minutes (healthy)
events-api               Up 3 minutes (healthy)
events-persistence       Up 3 minutes (healthy)
genui-mcp                Up 3 minutes (healthy)
mongodb                  Up 3 minutes (healthy)
simulator-m-02           Up 3 minutes (healthy)
simulator-p-04           Up 3 minutes (healthy)
simulator-p-07           Up 3 minutes (healthy)
timeseries-api           Up 3 minutes (healthy)
timeseries-persistence   Up 3 minutes (healthy)
```

| Address | What answers there |
|---|---|
| <http://localhost:5600/> | The example app, the subject of stops 2 to 5. It answers on this computer only. |
| <http://localhost:5520/mcp> | The generative UI backend, an MCP server. The app reads every value from it. |
| <http://localhost:5500/> | The Timeseries API: Swagger UI, and MCP at `/mcp`. |
| <http://localhost:5510/> | The Events API: Swagger UI, and MCP at `/mcp`. |
| `localhost:1883` | The MQTT broker the simulators publish to. |

**In the code:** [`compose.yaml`](../compose.yaml) is the stack, [`.env.example`](../.env.example) names every
port and setting. The three simulated machines, P-04, P-07 and M-02, are the three `simulator-*` services.

## 2. Home

Home asks "what needs you?". It sorts the machines by what they do now: first the ones in alarm, stopped or
without data, then the ones in setup, then the running ones, and it reads them again every ten seconds.

![Home with the heading Machines. Under "Needs you" are two rows, P-04 and P-07, both stopped, each with a
button "Ask why". Under "Running" is one tile, M-02.](images/tour/home.png)

In the picture two machines need you. P-04 is stopped without a recorded reason, P-07 is stopped with the
warning "Safety door open, machining interrupted", and both say since when. M-02 runs the program
`SHAFT_4711.MPF`. A row leads to the page of its machine, and "Ask why" starts a chat about it (stop 4). The
field "Ask a question" in the header starts a chat too.

**In the code:** [`apps/app/src/routes/index.tsx`](../apps/app/src/routes/index.tsx) is the page and its
groups, [`apps/app/src/machines/machine-item.tsx`](../apps/app/src/machines/machine-item.tsx) draws a row and a
tile. The values are the result of the tool `genui_machine_list`
([`apps/genui-mcp/src/machines.ts`](../apps/genui-mcp/src/machines.ts)). Which value is which state is decided
in one file, [`packages/cards/src/machine/state.ts`](../packages/cards/src/machine/state.ts).

The sidebar leads to a second overview, **Live values** (<http://localhost:5600/live>): a graph for each
physical value over the last 15 minutes, such as active power or the temperature of the spindle bearing, with
a line for each machine. A choice above the graphs shows one machine or all of them. It has no picture in
this tour.

**In the code:** [`apps/app/src/routes/live.tsx`](../apps/app/src/routes/live.tsx) is the page,
[`packages/cards/src/measurement/measurement-graph.tsx`](../packages/cards/src/measurement/measurement-graph.tsx)
a graph. The lines are the result of the tool `genui_measurement_series`
([`apps/genui-mcp/src/measurements.ts`](../apps/genui-mcp/src/measurements.ts)).

The page "Charts" in the sidebar, <http://localhost:5600/charts>, shows the last hours of every machine as charts:
one bar per machine with how long it was in each state, and a tile per machine with its state over the last 30
minutes.

**In the code:** [`apps/app/src/routes/charts.tsx`](../apps/app/src/routes/charts.tsx) is the page,
[`apps/app/src/charts/state-tiles.tsx`](../apps/app/src/charts/state-tiles.tsx) draws the two charts with the
chart of shadcn/ui. The values are those of the machine card, from `genui_machine_show` and `genui_span_list`,
read by one server function, `getCharts` in
[`apps/app/src/machines/get-machines.ts`](../apps/app/src/machines/get-machines.ts).

## 3. The page of one machine

A click on a machine opens its page, here <http://localhost:5600/machines/P-04>. It shows the machine card:
what the machine does now, and what it did over the last eight hours. It needs no language model.

![The page Machines / P-04 with the machine card. The card says Stopped, no alarm and no reason recorded,
since 20:36, program SHAFT_4711.MPF. Below is a band of the last 8 hours, the total duration of each state,
and the MQTT topics the values were read from.](images/tour/machine-page.png)

The card has three parts. On top is the state with its reason, since when it holds, and the active program.
In the middle is the band: one stripe from eight hours ago until now, coloured by state, and below it the
total of each state. The hatched part of this band is "No data": the stack of the picture had been running
for about two hours, and before that nobody published. At the bottom the card names the topics it read, so
every value can be traced to the broker.

**In the code:** [`apps/app/src/routes/machines.$machine.tsx`](../apps/app/src/routes/machines.%24machine.tsx)
is the page. The card is
[`packages/cards/src/machine/machine-card.tsx`](../packages/cards/src/machine/machine-card.tsx), its band
[`state-band.tsx`](../packages/cards/src/machine/state-band.tsx), and the shape of its values the contract in
[`contract.ts`](../packages/cards/src/machine/contract.ts). The tool `genui_machine_show` returns the values
and `genui_span_list` the spans of the band; the totals are added up in
[`apps/genui-mcp/src/history.ts`](../apps/genui-mcp/src/history.ts), never by a language model.

## 4. The chat beside the page

The button at the right end of the header opens the chat. It is a panel beside the page, and the page stays
where it is: you chat about what you see. A language model answers and calls the tools of the generative UI
backend, and the app draws the values of a tool call itself, with the same card as the page.

![The page of P-04 on the left and the chat panel on the right. The chat shows the question, the steps "Read
the guide of the backend" and "Read the machine", the machine card of P-04 as the result of a tool call, and
below it an answer in words about the last 8 hours. The input field at the bottom shows the model
spark/qwen3.8-27b and a microphone.](images/tour/chat-answer.png)

The picture shows one chat, with a language model configured. The question was "What did P-04 do over the
last 8 hours?". The chat lists each step of the model, "Read the guide of the backend" and "Read the machine";
a step opens to what its tool gave back. Whenever the answer is coming and nothing in it moves, before the
first step and after a step until the next one or the text comes, a running line "Thinking" stands there. The
chat draws the card from the values of the tool, and the model sums it up in a few sentences. The numbers are
the tool's and the wording is the model's: the card says 6 minutes of running, the model "just under 7
minutes". The stack had just started, so most of the 8 hours have no data. The card on the left is one minute
newer than the one in the chat: the page reads again, an answer shows what was true when it was given.

The chat needs a language model, and the demo starts without one. Then the panel says "No language model
configured" and names the missing settings; Home and the machine pages work as before. To configure a model,
copy `.env.example` to `.env`, set the address and the key of a LiteLLM gateway, at the hackathon the one of the
hub, and create the app again with `docker compose up -d app`. The chat offers the chat models the gateway
lists, and dictation takes its speech-to-text model. Without the hub, a key of Anthropic or OpenAI and
`docker compose --profile gateway up -d` start a gateway of the stack's own, see
[Language models](../apps/app/README.md#language-models).

| Setting | What it holds |
|---|---|
| `LLM_BASE_URL` | The address of the LiteLLM gateway |
| `LLM_API_KEY` | The key the gateway gave you |

The chat has no sign-in, and whoever reaches the port chats at the cost of the owner of the key. Read
[Language models](../apps/app/README.md#language-models) before you open the port to a network.

With more than one model, the input field offers a choice. The first model answers until a chat picks
another one, and the choice stays with that chat.

The button "Tools" in the input field lists the servers that give the chat its tools: the generative UI
backend, and the further ones the setting `APP_MCP_SERVERS` names, such as the optional Ultimaker service.
It says whether each one answers and names its tools, and marks a tool that can change something. A switch
takes a further server out of the chat from its next question on: the model then gets none of its tools. The
choice stays with the chat, as the model does. The two pictures of this stop were taken before the button
was there.

![Home on the left and the chat panel on the right, before the first question. The model picker in the input
field is open and lists seven models: spark/qwen3.8-27b, ticked, then three named openai/gpt and three named
anthropic/claude.](images/tour/chat-model-picker.png)

The models in the picture are the ones the gateway of the hackathon lists; yours are the ones your gateway
lists for your key, in its order.
The three questions above are suggestions to begin with.

While an answer comes, send turns into stop: it ends the answer, what came so far stays, and the next
question can go.

With a speech-to-text model at the gateway, the field also has a microphone: press it, speak, press it
again, and what was said stands in the field, to send like a typed question. The gateway decides which model
writes it down, see [Dictation](../apps/app/README.md#dictation). The picture of the answer shows the microphone
at the right of the field.

**In the code:** [`apps/app/src/chat/`](../apps/app/src/chat). `chat-sidebar.tsx` is the panel with the model
picker, `dictate.tsx` the microphone, `assistant.server.ts` the agent harness that talks to the model and calls the tools, `models.ts`
reads which models the settings name, `cards.tsx` lists what the app draws for which tool, card by card, and
`suggestions.ts` holds the three questions.

### The card in another host

The machine card is also an MCP App: one HTML file that the generative UI backend serves as the resource
`ui://genui/machine`, so a desktop chat that shows MCP Apps draws the same card next to its answer. How to
connect such a host is in [The machine card for other hosts](../apps/genui-mcp/README.md#the-machine-card-for-other-hosts).

![A desktop chat with the question "Show machine P-04". Under it the machine card of P-04, drawn by the chat
from the card file of the backend: in alarm since 15:39 with "Spindle overtemperature, machine stopped", the
program, and the states of the last eight hours as a band with their sums. Below the card the chat says the
same in two paragraphs.](images/tour/machine-card-in-host.png)

## 5. When a machine goes silent

A machine that stops publishing is not "stopped": nothing is known about it. Try it, and stop one simulator.

```bash
docker compose stop simulator-m-02
```

After 30 seconds without a sign of life, Home moves the machine to "Needs you" with the state "No data".

![Home with M-02 under "Needs you" with the badge "No data" and the text "No data from the adapter, last
known: Executing at 20:34". Under "Running" are P-04 and P-07; the tile of P-07 shows a
warning.](images/tour/home-no-data.png)

The row says what is known: no data from the adapter since 20:34, and the last thing the machine reported
before it fell silent. The other two machines are not affected. P-07 runs with an open warning, which its
tile shows. Start the simulator again, and within a few seconds the machine is back with a fresh "since":
a silence ends a run, because what happened in between is not known.

```bash
docker compose start simulator-m-02
```

**In the code:** the rule is in [When a machine is there](../apps/genui-mcp/README.md#when-a-machine-is-there).
[`apps/genui-mcp/src/liveness.ts`](../apps/genui-mcp/src/liveness.ts) finds the stretches of silence, and the
30 seconds are a constant in [`packages/cards/src/machine/contract.ts`](../packages/cards/src/machine/contract.ts).
The topics that count as a sign of life are in the [MQTT binding](../contracts/mqtt/README.md).

## 6. Where to change what

To add something of your own, a page, a card or a source of data, follow [Build your own](build-your-own.md).

Each part has a section "What is where" that maps its files:

| You want to change | Start here |
|---|---|
| A page, the layout or the chat of the app | [`apps/app`: What is where](../apps/app/README.md#what-is-where) |
| A tool, its text for a model, or how states and silence are computed | [`apps/genui-mcp`: What is where](../apps/genui-mcp/README.md#what-is-where) |
| A card, its contract, the wording or the colours of a state | [`packages/cards`: What is where](../packages/cards/README.md#what-is-where), and [A new card](../packages/cards/README.md#a-new-card) |
| What a machine publishes and how it is stored | [`contracts/`](../contracts/README.md) first, then the .NET services under [`source/`](../source) |

Below the app are the two APIs. Each one offers the same queries twice: over REST for applications, with a
Swagger UI to try them, and over MCP for agents.

![The Swagger UI of the Timeseries API at localhost:5500, version 0.0.1.0, with the first endpoints of the
group Timeseries: GET and POST for base unit values, string values and boolean
values.](images/tour/swagger-ui.png)

The picture shows the Swagger UI of the Timeseries API at <http://localhost:5500/>, in its light mode; the
lamp at the top right switches it. The Events API has the same page at <http://localhost:5510/>. Open an
endpoint and choose "Try it out" to send a request to the running stack.

| API | REST | MCP | Contract |
|---|---|---|---|
| Timeseries | <http://localhost:5500/>, OpenAPI at `/openapi/v1.json` | `http://localhost:5500/mcp` | [`contracts/openapi`](../contracts/openapi/README.md), [`contracts/mcp`](../contracts/mcp/README.md) |
| Events | <http://localhost:5510/>, OpenAPI at `/openapi/v1.json` | `http://localhost:5510/mcp` | the same |
| Generative UI | none: it is an MCP server only | `http://localhost:5520/mcp` | [`contracts/mcp`](../contracts/mcp/README.md), [`packages/cards`](../packages/cards/README.md) |

To use the tools from your own agent, add the three MCP addresses to any MCP client; the entry to copy is in
[`contracts/mcp`](../contracts/mcp/README.md).

---

## Optional: a real printer

The physical-printer integration is not part of the six stops. Start only its service with
`docker compose --profile ultimaker up -d --build --wait ultimaker-api`.
It exposes MCP at <http://localhost:5530/mcp> and an OpenAPI document at
<http://localhost:5530/openapi/v1.json>. Printing is disabled by default. The configuration, Cura
preview workflow and validation limits are in the
[Ultimaker service guide](../source/Pleiades.Playground.Ultimaker.Api/README.md).
No tour screenshot changes: this service adds no application screen.
The optional `ultimaker-telemetry` service publishes live printer observations to the existing broker.
Its logical machine ID defaults to `UM3-01`, which then appears in the existing machine list/card.
See the [adapter guide](../source/Pleiades.Playground.Ultimaker.Telemetry/README.md) for topic names,
units, timestamps and how to verify persistence. The existing Home screenshot was not retaken;
it therefore still shows only simulated machines.
For deployment from published images, enable `COMPOSE_PROFILES=ultimaker` in the server's private
.env; both services use the same commit tag as the rest of the stack. See
[deployment](deployment.md#enable-the-ultimaker-services).

## Retaking the screenshots

One command takes the screenshots from the running stack and writes them under
[`images/tour/`](images/tour), each 1280 × 800 pixels in the light theme:

```bash
pnpm install
pnpm exec playwright install --only-shell chromium    # once: the browser that takes the pictures
node .github/scripts/tour-screenshots.mjs
```

Take them from a stack on the default ports that has run for a while. On a stack that has just started, the
band of the machine page is almost all "No data", and with moved ports the picture of the Swagger UI shows
another port than the text of stop 6. If you started the stack with `-p <name>`, run the script with
`COMPOSE_PROJECT_NAME=<name>`: without it the script looks for the stack of the default name.

To take only some, name them: `node .github/scripts/tour-screenshots.mjs home machine-page`. The names are
the file names without `.png`. Two pictures do something to the stack, see the head of
[the script](../.github/scripts/tour-screenshots.mjs):

- `chat-answer` asks the language model of the chat one question, at the cost of the owner of its key.
  Without a language model the two pictures of the chat are left out, and the run says so.
- `home-no-data` stops the simulator of M-02 for about a minute and starts it again, also when you interrupt
  the run with Ctrl+C. If a run is ended in a way it cannot catch and M-02 stays without data, start it with
  `docker compose start simulator-m-02`.

The picture of the card in another host, `machine-card-in-host.png`, is taken by hand: it shows another
program, not the stack.

The simulator keeps changing the states, so a new picture shows other states than the one before. Look at
it, and describe in the text of its stop what it shows. Whoever changes what a stop shows keeps the stop
current, see [CONTRIBUTING.md](../CONTRIBUTING.md#conventions); CI checks that every pointer of this page
still has its target.
