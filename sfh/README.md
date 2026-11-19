# SFH app

The demo stack as an app of the [Smart Factory Host](https://docs.smartfactoryhost.com/app/01_appdevguide/) (SFH),
described in an AppDefinition of version 1.2.1.

```text
sfh/
├── app-definition.json   The AppDefinition: containers, volumes, values. Without semver, changelog and appId:
│                         those go into the AppVersion that wraps it.
├── build-images.sh       Builds the images of this repository for linux/amd64 and mirrors the third-party ones
├── push-images.sh        Pushes every image the definition names into the Harbor project of the app
└── run-local.py          Runs the definition on this computer with Docker, as one pod, and checks its probes
```

## How it differs from `compose.yaml`

An SFH app is one Kubernetes pod: all containers share one network namespace and reach each other on
`127.0.0.1`, not by a service name. The definition runs the nine containers of the core stack without simulators:
broker, MongoDB, the APIs and their persistence, the generative UI backend and the example app. It brings no data of
its own: the machines that publish to its broker by the MQTT binding (`contracts/mqtt`) are what it shows, for
example the adapter of another SFH app, which reaches the broker App2App on port 1883, or a machine or adapter in
the network of the SFH, which reaches it on the same port of the SFH itself (`hostPort`).

- **One port per container.** Every service of this repository listens on 8080 in its image. In one pod they
  would collide, so each one gets a port of its own: `ASPNETCORE_HTTP_PORTS` for the .NET services, `PORT` for
  the Node.js ones. The APIs keep the port compose publishes them on.

  | Container | Port | Reachable |
  |---|---|---|
  | `app` | 5600 | reverse proxy, `https://pleiades.<sponsorRef>.sfh.edge-device.net`; App2App 5600 |
  | `broker` | 1883 (MQTT), 9001 (MQTT over WebSocket) | `hostPort` 1883 and 9001 on the SFH; 9001 by reverse proxy, `wss://pleiades-mqtt.<sponsorRef>.sfh.edge-device.net`; App2App 1883 and 9001 |
  | `timeseries-api` | 5500 | App2App |
  | `events-api` | 5510 | App2App |
  | `genui-mcp` | 5520 | App2App |
  | `sites-api` | 5540 | App2App |
  | `timeseries-persistence`, `events-persistence` | 5501, 5511 | probes only |
  | `mongodb` | 27017, on `127.0.0.1` only | inside the pod |

- **`127.0.0.1` for `broker` and `mongodb`.** The single-node replica set names its member `127.0.0.1:27017`.
- **No `depends_on`.** The containers start together; the services connect again until broker and MongoDB answer.
  The healthcheck of compose that initiates the replica set is the `startupProbe` of `mongodb`.
- **Probes.** Readiness and liveness of the services are the bare `/health`, not `/healthcheck`: a pod is reachable
  only while every container is ready, so a dependency probed in one container would take the app down. The workers
  that only map `/healthcheck` (the two persistence services) take it as their `startupProbe`, then a TCP check.
  The kubelet sends an `httpGet` or `tcpSocket` probe to the pod IP, not to `127.0.0.1`. MongoDB listens on
  `127.0.0.1` only, so nothing outside the pod reaches it; its readiness and liveness are therefore an exec check
  from inside the container, `alive.sh`. `run-local.py` probes the pod IP as well.
- **No exec probe with arguments.** The SFH app-generator HTML-escapes the YAML of a probe, and an argument that
  YAML quotes (`-t`, `1`) then breaks the chart: `helm install` fails with "did not find expected alphabetic or
  numeric character", because `'-t'` arrives as `&#39;-t&#39;`. The bug is reported to the SFH team.
  Until it is fixed, the check of the broker and the one of MongoDB that initiates the replica set are scripts in a
  `configMap`, which the generator writes unescaped, and the probe is `["sh", "<script>"]`. Keep `&`, `'`, `<` and
  `>` out of environment values for the same reason.
- **Browser and broker.** The pages hear live values over MQTT over WebSocket. `MQTT_WS_URL` points the browser at
  the subdomain of the broker's WebSocket, built the way the generated Ingress builds its host:
  `pleiades-mqtt.{{ .Values.sponsorRef | lower }}.{{ .Values.basedomain }}`.
- **Volumes.** MongoDB keeps its data on a persistent volume of 10 GiB.
  The broker configuration is a `configMap`, the same as `stacks/broker/mosquitto.conf`.
- **Images.** The third-party images are pinned to the patch release the floating tag of compose stands for now:
  `eclipse-mosquitto:2.1.2-alpine` and `mongo:8.0.38`. The SFH does not reach Docker Hub, so they go into the
  Harbor project of the app with the others.
- **Memory.** The .NET services use the workstation GC (`DOTNET_gcServer=0`), which needs far less memory in a
  small container.
- **Left out:** the services behind a profile, `ultimaker-*`, `juicebar-api` and `litellm`; the cutting machines
  (`cutting-*`) and OPC UA (`opcua-adapter`, `opc-simulator`), which `compose.yaml` starts as well; every simulator,
  the three simulated machines `simulator-*` included: the SFH app runs no simulator; and `extra_hosts`: the chat
  reaches a language model at the address of `llmBaseUrl`. Without `OPCUA_MCP_URL` the chat has no OPC UA, and
  `genui-mcp` finds the Sites API at its default, `http://localhost:5540`, which is where it runs in the pod.

## Values

Set per deployment through the API.

| Value | Default | Sets |
|---|---|---|
| `dataRetention` | `30.00:00:00` | how long time series and events are kept |
| `llmBaseUrl`, `llmApiKey` | empty | the LiteLLM gateway of the chat; without it the chat says so and everything else works |
| `appMcpServers` | empty | `APP_MCP_SERVERS` of the app |
| `cardResourceDomains` | empty | `CARD_RESOURCE_DOMAINS` of `genui-mcp` |

## Build, check, push

```bash
sfh/build-images.sh 0.2.1-rc3                 # local images under pleiades-sfh/
~/.claude/skills/sfh-app/scripts/sfh.sh validate sfh/app-definition.json   # offline, with the sfh-app skill
sfh/run-local.py up                           # the pod on this computer: http://127.0.0.1:5600/
sfh/run-local.py down
sfh/push-images.sh core.harbor.smartfactoryhost.com/<project>
```

The tag of the images of this repository is the semver of the app version; a released version is frozen, so a
change needs a new semver and new images.

## Security

The app keeps the demo's settings: the broker accepts anonymous clients, also over its WebSocket subdomain, the
APIs have authorization switched off, and the chat has no sign-in and spends the key of `llmApiKey`. Whoever
reaches the subdomains of the SFH can use them.

The broker's ports 1883 and 9001 are `hostPort`s: every device that reaches the SFH can publish and subscribe on
them without signing in, and so put values into the app or read all of them. No other app on the same SFH may take
these ports; the SFH does not guard against two apps that do.
