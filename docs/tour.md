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
database, the two APIs with their persistence workers, the Sites API, the generative UI backend, the app, one
simulator per machine, three cutting machines, each a simulator with its adapter, the OPC UA adapter with a
simulated OPC UA machine. To see the demo without building it, start it from the published images, see
[Start](../README.md#start).

```bash
docker compose ps --format "table {{.Service}}	{{.Status}}"
```

```text
SERVICE                  STATUS
app                      Up 3 minutes (healthy)
broker                   Up 3 minutes (healthy)
cutting-adapter-laser-2d Up 3 minutes (healthy)
cutting-adapter-punch    Up 3 minutes (healthy)
cutting-adapter-tube     Up 3 minutes (healthy)
cutting-laser-2d         Up 3 minutes (healthy)
cutting-punch            Up 3 minutes (healthy)
cutting-tube             Up 3 minutes (healthy)
events-api               Up 3 minutes (healthy)
events-persistence       Up 3 minutes (healthy)
genui-mcp                Up 3 minutes (healthy)
mongodb                  Up 3 minutes (healthy)
opc-simulator            Up 3 minutes (healthy)
opcua-adapter            Up 3 minutes (healthy)
simulator-m-02           Up 3 minutes (healthy)
simulator-p-04           Up 3 minutes (healthy)
simulator-p-07           Up 3 minutes (healthy)
sites-api                Up 3 minutes (healthy)
timeseries-api           Up 3 minutes (healthy)
timeseries-persistence   Up 3 minutes (healthy)
```

| Address | What answers there |
|---|---|
| <http://localhost:5600/> | The example app, the subject of stops 2 to 5. It answers on this computer only. |
| <http://localhost:5520/mcp> | The generative UI backend, an MCP server. The app reads every value from it. |
| <http://localhost:5500/> | The Timeseries API: Swagger UI, and MCP at `/mcp`. |
| <http://localhost:5510/> | The Events API: Swagger UI, and MCP at `/mcp`. |
| <http://localhost:5540/> | The Sites API, where the machines stand: Swagger UI, and MCP at `/mcp`. It answers on this computer only. |
| <http://localhost:5611/>, `:5612`, `:5613` | The web pages of the three cutting machines, a 2D laser, a tube laser and a punching machine: their plan, their alarms and every telegram. They answer on the network too, like the web UI of the OPC UA simulator. |
| `localhost:1883` | The MQTT broker the simulators and adapters publish to. |
| <http://localhost:5560/machines> | The OPC UA adapter: the machines added over OPC UA. It answers on this computer only. |
| <http://localhost:8090/> | The web UI of the simulated OPC UA machine, A1121O0001. |

**In the code:** [`compose.yaml`](../compose.yaml) is the stack, [`.env.example`](../.env.example) names every
port and setting. The three simulated machines, P-04, P-07 and M-02, are the three `simulator-*` services.
Each publishes after the umati data model, below `machines/<manufacturer>_<model>_<serial number>/` (for P-04
`machines/alcyone-machines_AX-400_P-04/`): manifest, values, its stack light, and job orders, program executions
and alerts as CloudEvents. It is described in
[`contracts/mqtt`](../contracts/mqtt/README.md#machines-the-binding-of-the-data-model). The cutting machines, L-01,
T-01 and PU-01, are the `cutting-*` services: a simulator that speaks the telegram protocol of the machine through
files, and an adapter that reads it and publishes the same tree, below `machines/trumpf_Laser2D_L-01/` and the like
(see [`Cutting.Adapter`](../source/Pleiades.Playground.Cutting.Adapter/README.md)).

The SimpleCAM machine 9042 is optional: `simplecam-adapter-9042` reads the stream of a SimpleCAM backend that runs
outside of the stack and publishes the same tree for it, below `machines/united-grinding_simplecam_9042/`. It
starts only with the Compose profile `simplecam`, as it needs that backend (see
[`simplecam-adapter-9042`](../apps/simplecam-adapter-9042/README.md)).

The OPC UA machine, `opc-simulator`, is not on Home yet: it is added in the chat, see
[Add a machine that speaks OPC UA](#add-a-machine-that-speaks-opc-ua).

The persistence services store the values as they come, in the units of the model, and the CloudEvents as they
came; the APIs put job orders, program executions and alerts together from them when they are read.

> **For now:** the screenshots of the stops below show the state before the machine id and the work master; they
> are retaken once the stack runs with this tree.

## 2. Home

Home, <http://localhost:5600/>, shows where the machines stand and what each of them does now: site by site and
hall by hall, a row for each machine on a site. The line under the title says how many machines stand on how many
sites, how many of them send data now and how many need someone; the backend counts them. The head of each site names its company and how many of its machines are in
each state; it stays at the top while the rows of its site scroll, and a click folds the site. "Needs you" keeps
the machines in alarm, stopped or without data, each in its site and hall: what Home used to show first. The
search finds a machine by its name, model, serial number, machine id, work master, hall or site. Ten sites make a
page; the choice and the page are in the address, `?show=needs&page=2`. The sites without a machine are named
once, on the last page. Home is live: it reads the list once, and from then on the browser hears every value at the
broker, MQTT over WebSocket on port 9001, the moment a machine publishes it.

A machine does not show up on Home by itself: people put it on a site. A machine that sent data in the last 24
hours and stands on no site is named in a bar above the list, a few by name and how many more; "Review and add"
opens "Add machine" with the first of them chosen. "Add machine" at the top of the page opens the same dialog
empty: the machine, one that sent data or one named by its id, which shows "No data" until it sends, then the site, the hall and the name
people know it by; a new site or hall is made there too. The menu "⋯" of a row moves the machine ("Move…") or
takes it off its site ("Remove from site"), and "Undo" in the toast takes back each change, as long as nobody
changed the machine since, together with a site or hall the change made. Home writes to the
[Sites API](../source/Pleiades.Playground.Sites.Api/README.md), at <http://localhost:5540/>, which takes the same
over REST. A stack that has just started has no site: every machine that sends is in the bar. While the Sites API
does not answer, a line says the sites cannot be read now and names a few of the machines that sent data; then
nothing can be added.

![Home: "3 machines at 2 sites · 2 send data now · 2 need you" and the button Add machine at the right. Below, the
bar "4 machines sent data in the last 24 hours but are not on a site yet: TP-800 P-07, Laser2D L-01, Punch PU-01 +1"
with Review and add; the search, All and Needs you, and the counts of all sites. North plant of Demo Manufacturing:
Lathe 4 stopped in Hall 1 with the warning "Coolant pressure low", MM-120 M-02 running in Hall 2 with the warning
"Filter of the coolant clogged", and "Hall 3: no machine". South plant with AX-400 M-09 without data in Hall A. Each
row has the menu "⋯".](images/tour/home.png)

In the picture Lathe 4, the name entered for P-04, is stopped with the warning "Coolant pressure low", 20017, and
says since when; M-09 stands in the South plant but has no simulator, so nothing is known about it and its row
leads nowhere. P-07 and the three cutting machines sent data and stand on no site: the bar names them, and
"Review and add" puts one on a site. A row leads to the page of its machine, and
"Ask why" starts a chat about it (stop 4). The field "Ask a question" in the header starts a chat too.

**In the code:** [`apps/app/src/routes/index.tsx`](../apps/app/src/routes/index.tsx) is the page,
[`apps/app/src/sites/filter.ts`](../apps/app/src/sites/filter.ts) chooses what "Needs you" and the search show
and cuts the pages, and [`apps/app/src/machines/machine-item.tsx`](../apps/app/src/machines/machine-item.tsx)
draws a row. [`apps/app/src/sites/row-actions.tsx`](../apps/app/src/sites/row-actions.tsx) is "Add machine" and the
menu of a row, [`apps/app/src/sites/place-dialog.tsx`](../apps/app/src/sites/place-dialog.tsx) their dialog, and [`apps/app/src/sites/sites-api.ts`](../apps/app/src/sites/sites-api.ts) writes to the Sites API from
the server of the app. The values are the result of the tool `genui_site_list`
([`apps/genui-mcp/src/sites.ts`](../apps/genui-mcp/src/sites.ts)), which groups and counts. Which value is which
state is decided in one file, [`packages/cards/src/machine/state.ts`](../packages/cards/src/machine/state.ts).
What the broker sends is laid onto the list in [`apps/app/src/live/`](../apps/app/src/live/), and
[`apps/app/src/hooks/use-live.ts`](../apps/app/src/hooks/use-live.ts) keeps a page live. The address `/sites`,
where the list of the sites stood before, leads here.

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
read once by one server function, `getCharts` in
[`apps/app/src/machines/get-machines.ts`](../apps/app/src/machines/get-machines.ts); from then on the page is
live from the broker, as Home is.

The page "Where is My Job?" in the sidebar, <http://localhost:5600/where-is-my-job>, is a basis for
discussion: how an order could be followed across the shop floor. It shows the machines of the stack from above, with their state, utilisation
and job orders; a machine with what it did, does and what waits for it; and an order on its way. An order is
every job order that names the same order number, read from the backend (`genui_job_order_list`) and kept
live by the retained lists `JobMonitoring/JobOrders` and `JobOrderResults`. Programming before the machines,
packing after them and the single part on its sheet have no source yet: the page draws them dashed, as the
gaps to discuss. It has no picture in this tour.

**In the code:** [`apps/app/src/routes/where-is-my-job.tsx`](../apps/app/src/routes/where-is-my-job.tsx)
is the page; the map, the panels and `getFloor` live in
[`apps/app/src/where-is-my-job/`](../apps/app/src/where-is-my-job/), and `floor.ts` there
groups the job orders into orders.

## 3. The page of one machine

A click on a machine on Home opens its page, here
<http://localhost:5600/sites/alcyone-machines_AX-400_P-04>; it stands under Home, and the breadcrumb leads back
there. An address from before the page moved, `/machines/alcyone-machines_AX-400_P-04`, leads to it with its
hours. The address carries the machine id, the page is titled with model and serial number, AX-400 P-04. It shows the
machine card: what the machine does now, with which work master and job order, the alerts that stand, and what
it did over the last hours. It needs no language model. The title is a switcher: a click on it opens the list
of every machine with its state, to search by model, serial number, machine id or state, and Enter opens the
one picked. The buttons Last 1 h, Last 8 h and Last 24 h at the right choose how many hours the card goes back;
the choice is in the address, `?hours=8`, and stays when you switch to another machine. The page is live like Home: the band
keeps its length and moves on with the clock. Under the title it says where the machine stands, its site and
hall from the Sites API, or "On no site".

![The page of P-04, with the breadcrumb Home › alcyone-machines_AX-400_P-04 and Home active in the sidebar.
The title AX-400 P-04 has an arrow for the switcher, and at the right stand the buttons Last 1 h, Last 8 h and
Last 24 h, with Last 8 h chosen. Under the title it says "South plant · Hall 2" and "live · now 21:55". The
machine card says Running, since 21:55, work master WM-BUSHING-0815, job order 4749/01, 17 of 20. Below is a band
of the last 8 hours with the hours 16:00, 18:00 and 20:00 under it, and the total duration of each state. Under
the card the section Now has four tiles: active power 9.07 kW with a small graph of the last minutes, energy over
the last 8 hours 60.9 kWh, spindle 1 Rotating, and feed override 80 % with a bar. Below begins the section Alarms
& warnings.](images/tour/machine-page.png)

The card has two parts. On top is the state with its reason, since when it holds, the work master and the job
order that runs. Below is the band: one stripe from the chosen number of hours ago until now, coloured by state,
and below it the full hours and the total of each state. A stack that has just started has a band that is mostly
hatched, "No data": before it started nobody published. In the chat the same card names at its foot the topics
it read, so every value can be traced to the broker; the page leaves that line out.

Below the card come three sections of the machine, each a card with a title, and inside it the card of a tool
for this machine, the same the chat draws, without its frame. "Now" shows what the machine measures now as
tiles, live from the broker as on the page Live values: its active power with the last 15 minutes as a small
graph, the energy it imported over the chosen hours, its spindle and its feed override; a value of a machine
that has fallen silent is marked "not current". "Alarms & warnings" lists its errors and warnings over the
chosen hours, all of them or one level, ten on a page, those that stand first; the list is read again the
moment the machine raises, changes or clears an alert. "Power and energy" draws its power over the chosen hours
in kilowatts, and below it a table with the energy it imported in those hours, its mean and its peak. In the
chat the same cards have their frames and feet, and the time series card its lines and the way to add one. The card comes first and
the sections after it, each with a grey placeholder until it is there; a section whose backend does not answer
says so and asks again, while the others stand. Choose other hours, and the page stays: the card and the
sections that depend on the hours are read again and change when their answers are there.

**In the code:** [`apps/app/src/routes/sites.$machine.tsx`](../apps/app/src/routes/sites.%24machine.tsx)
is the page, [`machines.$machine.tsx`](../apps/app/src/routes/machines.%24machine.tsx) leads the old address to it, and the choice of the hours and the list of the switcher are in
[`apps/app/src/machines/switcher.ts`](../apps/app/src/machines/switcher.ts). The card is
[`packages/cards/src/machine/machine-card.tsx`](../packages/cards/src/machine/machine-card.tsx), its band
[`state-band.tsx`](../packages/cards/src/machine/state-band.tsx), and the shape of its values the contract in
[`contract.ts`](../packages/cards/src/machine/contract.ts). The tool `genui_machine_show` returns the values
and `genui_span_list` the spans of the band; the totals are added up in
[`apps/genui-mcp/src/history.ts`](../apps/genui-mcp/src/history.ts), never by a language model. What the sections
take from the answers, the place of the machine and its line among all, is chosen in
[`apps/app/src/machines/sections.ts`](../apps/app/src/machines/sections.ts); the sections draw the cards of
[`packages/cards`](../packages/cards/README.md): the measurement tiles, notification, time series and energy.

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

With an external documentation service configured as `docs` in `APP_MCP_SERVERS` and enabled under
"Tools" in the message field, ask how to operate,
maintain or program a machine. The chat searches its manuals and shows source references by filename and
page label, with the physical PDF page also shown when it differs. Select one to open that physical PDF page. Use the page controls, zoom and **Find**
to explore it; **Next match** moves between matching pages. The **Extracted text** tab shows the evidence
used by chat. A replaced or unavailable source asks you to search again. Both views read documentation
through MCP; the app has no direct connection to the documentation REST API.
Documentation source references stay in the chat and are not cards for "Save as page".

The panel works like a chat app on a phone: a list and a chat, with a way back. The head says what is open. In a
chat it says the name of the chat, which is its first question, on one line and cut where it is too long; the
button "All chats" at its left leads back to the list, and the page beside the panel stays where it is. The
list, headed "Chats", shows the chats so far, and the field at its foot begins a new one, with the questions to
begin with above it. The plus "New chat" in the head of the list and of every chat opens a new chat with the
cursor in its field. Close the panel and open it again, and the chat you left is there. The chats are kept in
the memory of the app's server and are gone when it restarts.

Under an answer that has ended and for which the chat drew a card, the chat offers "Save as page". It keeps all
the cards of that answer, in their order, as a page titled with your question, and opens the page beside the
chat, which stays open. No language model is asked: the app reads the tool calls from the answer it already
has. The page keeps no number and no sentence of the model, so opening it calls the tools again and its cards
show what holds now. The row under the answer then says "Saved as page" and links to it. An answer without a
card, such as one in words only, has no button. The group "Pages" in the sidebar lists the pages of this browser
that are not pinned, the newest first, and a page that is pinned from its head moves to the top of the sidebar,
beside Home. "Edit" in its head moves a card up or down and removes one, with no language model; "Undo" in
the toast puts a removed card back. "Add a card" at the end of the page adds one by hand: choose what it shows,
and for one machine which machine and how many hours.

Ask the chat for a page, for example "Make me a page with all machines and P-04", and it proposes one. The model
reads with its tools what there is to show and composes the page: a title, and the cards in their order, each
with the machine and the hours it shows. It writes no value and cannot keep the page. The chat shows the
proposal with its parts in words; "Preview" opens it with the values of now, and "Save to my pages" keeps it in
this browser. What you asked for that no card shows, the model says in words.

Ask the chat for a page, for example "Make me a page with all machines and P-04", and it proposes one. The model
reads with its tools what there is to show and composes the page: a title, and the cards in their order, each
with the machine and the hours it shows. It writes no value and cannot keep the page. The chat shows the
proposal with its parts in words; "Preview" opens it with the values of now, and "Save to my pages" keeps it in
this browser. What you asked for that no card shows, the model says in words.

A page is private to the browser that keeps it, and the stack has no sign-in, so "Share" in its head gives a
link that carries the recipe: which answers, for which machines and hours, and no value. Open it in a private
window to see what a colleague sees: the page with the values of now, no chat and no language model needed,
and above it "Opened from a link" with "Save to my pages". A part the colleague's app has no card for says so,
and the rest of the page is whole. A link that was cut off when it was copied says that it holds no page.

Ask about the alarms of a machine, for example "Which warnings and errors did P-04 have today?", and the chat
draws the notification card of the tool `genui_notification_list`: each warning and error with when it was
raised, when it went and how long it stood, and the ones that have not gone first. The card is
[`packages/cards/src/notification/notification-card.tsx`](../packages/cards/src/notification/notification-card.tsx),
the tool is in [`apps/genui-mcp/src/notifications.ts`](../apps/genui-mcp/src/notifications.ts). No screenshot
shows it yet.

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
picker and the head with the way back to the list, `chat-name.ts` what a chat is called,
`save-as-page.tsx` the row under an answer with "Save as page" (the recipe of an answer is read in
[`pages/from-answer.ts`](../apps/app/src/pages/from-answer.ts)), `propose-page.ts` the tool with which the model
proposes a page and `proposed-page.tsx` the proposal (the check is in
[`pages/proposal.ts`](../apps/app/src/pages/proposal.ts)), `dictate.tsx` the microphone, `assistant.server.ts` the agent harness that talks to the model and calls the tools, `models.ts`
reads which models the settings name, `cards.tsx` lists what the app draws for which tool, card by card, and
`suggestions.ts` holds the three questions.

### Add a machine that speaks OPC UA

Type `/` in the chat field: the list of commands opens, and `/help` explains them. Below the commands
stand the tools of the MCP servers the chat has: `/machine` finds `/genui_machine_show`, and
`/genui_machine_show M-02` asks the model to answer with that tool. The arrow keys mark an entry, Tab writes
it into the field, Enter takes it and Escape closes the list. Ask
`/discover A1121O0001`, and the model scans the OPC UA server of the simulated machine, matches its nodes to
the data model and shows a proposal: the endpoint with the strongest security, whether the machine fulfils
the core of the data model and which profiles are complete, every element with its value, and what is
derived, unclear or missing. What the core lacks is marked as not available. The machine is added when you
press "Add machine" on the proposal; from then on it sends like the others, also after a restart, and stands in
the bar of Home until you add it to a site there.
`/opcua` lists the added servers with their core and profiles, and a button that removes a machine together
with its retained messages on the broker; `/mapping A1121O0001` shows what needs a look.

**In the code:** [`apps/app/src/opcua/`](../apps/app/src/opcua) holds the commands and the cards of the chat,
and the adapter is [`source/Pleiades.Playground.OpcUa.Adapter`](../source/Pleiades.Playground.OpcUa.Adapter/README.md).

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

If M-02 stands on no site yet, add it to one on Home first (stop 2): Home lists only the machines on a site.
After 30 seconds without a sign of life, Home shows the machine with the state "No data" in its site and hall,
and "Needs you" lists it.

![Home with MM-120 M-02 in Hall 2 of the North plant: the badge "No data" and the text "No data from the adapter.
The adapter says Shutdown. Last known: Executing at 21:36", with "Ask why". The line under the title says "1 sends
data now · 3 need you", and the counts of the North plant say 1 stopped and 1 no data](images/tour/home-no-data.png)

The row says what is known: no data from the adapter since 21:36, and the last thing the machine reported
before it fell silent. It stays in its site and hall, and the counts of the site follow. The other machines are
not affected. Start the simulator again, and within a few seconds the machine is back with a fresh "since":
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
| Cutting machines that take their jobs through telegram files, and the adapter that brings them onto the broker (they start with the stack; the tour does not visit them) | [`Cutting.Simulator`](../source/Pleiades.Playground.Cutting.Simulator/README.md), [`Cutting.Adapter`](../source/Pleiades.Playground.Cutting.Adapter/README.md) |
| How a machine that speaks OPC UA is scanned, mapped and run | [OPC UA adapter](../source/Pleiades.Playground.OpcUa.Adapter/README.md) |

Below the app are the two APIs, and next to them the Sites API, which keeps where the machines stand. Each one
offers the same queries twice: over REST for applications, with a Swagger UI to try them, and over MCP for
agents.

![The Swagger UI of the Timeseries API at localhost:5500, version 0.0.1.0, with the first endpoints of the
group Timeseries: GET and POST for base unit values, string values and boolean
values.](images/tour/swagger-ui.png)

The picture shows the Swagger UI of the Timeseries API at <http://localhost:5500/>, in its light mode; the
lamp at the top right switches it. The Events API has the same page at <http://localhost:5510/>, with the
CloudEvents of the machines as they came (`/machineEvents`, and the gaps in their `sequence`), and the views put
together from them: the alerts (`/alerts/active`, `/alerts/pairs`, `/alerts/statistics`), the job orders
(`/jobOrders`) and the program executions (`/programExecutions`). Open an
endpoint and choose "Try it out" to send a request to the running stack.

| API | REST | MCP | Contract |
|---|---|---|---|
| Timeseries | <http://localhost:5500/>, OpenAPI at `/openapi/v1.json` | `http://localhost:5500/mcp` | [`contracts/openapi`](../contracts/openapi/README.md), [`contracts/mcp`](../contracts/mcp/README.md) |
| Events | <http://localhost:5510/>, OpenAPI at `/openapi/v1.json` | `http://localhost:5510/mcp` | the same |
| Sites | <http://localhost:5540/>, OpenAPI at `/openapi/v1.json` | `http://localhost:5540/mcp` | the same |
| Generative UI | none: it is an MCP server only | `http://localhost:5520/mcp` | [`contracts/mcp`](../contracts/mcp/README.md), [`packages/cards`](../packages/cards/README.md) |

To use the tools from your own agent, add the MCP addresses to any MCP client; the entry to copy is in
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
Its machine id defaults to `ultimaker_UM3_UM3-01`, which then appears in the existing machine list/card.
See the [adapter guide](../source/Pleiades.Playground.Ultimaker.Telemetry/README.md) for topic names,
units, timestamps and how to verify persistence. The existing Home screenshot was not retaken;
it therefore still shows only simulated machines.
For deployment from published images, enable `COMPOSE_PROFILES=ultimaker` in the server's private
.env; both services use the same commit tag as the rest of the stack. See
[deployment](deployment.md#enable-the-ultimaker-services).

## Optional: a juice bar

A machine that mixes drinks is not part of the six stops either. With a machine that runs MixerControl at
`JUICEBAR_URL`, start its service with
`docker compose --profile juicebar up -d --build --wait juicebar-api`.
It exposes MCP at <http://localhost:5550/mcp> and an OpenAPI document at
<http://localhost:5550/openapi/v1.json>: the card, the state of the machine, and an order. An order joins
the queue of the real machine; a person then presses its start button. What the service does and never does
is in the [juice bar service guide](../source/Pleiades.Playground.JuiceBar.Api/README.md).
The service publishes the state of the machine to the broker. Its machine id defaults to
`trumpf_JuiceBar_JUICEBAR-01`, which then appears in the machine list of Home as "JuiceBar JUICEBAR-01", next
to the simulated machines. With
`juicebar=http://juicebar-api:8080/mcp` in `APP_MCP_SERVERS`, the chat answers what the bar can mix and
orders a drink when asked. Asked what the bar has, it draws the drink card: each drink in its glass, one to
pick, and a button that orders it at once; the glass then fills while the machine mixes. A stack with
`APP_SHOWCASES` set has the same card as a page of its own, <http://localhost:5600/juice-bar>, for a screen next to
the machine, without a language model. No tour screenshot was retaken: they show the stack without the profile.
For deployment from published images, see [deployment](deployment.md#enable-the-juice-bar-service).

## Optional: Titan, an assistant you talk to

Titan is not part of the six stops either. A stack with `APP_SHOWCASES` set has the page
<http://localhost:5600/titan>, in the sidebar like every page: a dark panel with a cloud of points. A click on it
or the space bar starts it. Then
hold the space bar, ask "Welche Maschine steht?" and let go, or say "Hey Titan" and the question. Titan
says "Moment." at once and answers aloud, in German, from the values of the stack; the screen shows the answer
in one sentence, what to do, and the machine it is about. The space bar interrupts it, P pauses it, and the
sidebar leads away from it.

Titan needs the language model of stop 4, and of the same gateway a transcription model to listen. With a
speech model at the gateway it speaks with that voice, else with a voice of the browser. Everything it hears
goes to the gateway: its guide, [`apps/app/src/showcases/titan`](../apps/app/src/showcases/titan/README.md),
says what that means in a room and how it works. No tour screenshot was taken of it.

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
