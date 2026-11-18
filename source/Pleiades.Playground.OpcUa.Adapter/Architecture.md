# OPC UA adapter: architecture

How the adapter runs several machines, what it publishes to the broker, and where it keeps its OPC UA
configuration. What the adapter does and why is in the [README](README.md).

## Machines, sessions and topics

The example has two machines behind a gateway and one machine with an OPC UA server of its own:

```text
  ┌────────────────────────────────────────────────────┐   ┌────────────────────┐
  │ MQTT broker                                        ├──▶│ timeseries         │
  │  machines/{machineId}/umati/Manifest               │   │ values, connection │
  │  machines/{machineId}/umati/<Group>/<Element>      │   └────────────────────┘
  │  machines/{machineId}/oem/<Group>/<Element>        │   ┌────────────────────┐
  │  machines/{machineId}/umati/Connection/State       ├──▶│ events             │
  │  machines/{machineId}/events/notifications         │   │ alarms             │
  └─────────────────────┬──────────────────────────────┘   └────────────────────┘
                        ▲ one MQTT connection per machine, binding of machines
  ┌─────────────────────┴───────────────────────────────────────────────────────┐
  │ opcua-adapter           MachineSupervisor, SessionPool                      │
  │  ┌─────────────────────────────────────────────┐   ┌──────────────────────┐ │
  │  │ SharedSession opcgateway:11878              │   │ SharedSession M3     │ │
  │  │  ┌───────────────────┐ ┌───────────────────┐│   │  ┌─────────────────┐ │ │
  │  │  │ MachineConnection │ │ MachineConnection ││   │  │MachineConnection│ │ │
  │  │  │ A0280O0001        │ │ A1121O0001        ││   │  │ M3              │ │ │
  │  │  │ own subscription  │ │ own subscription  ││   │  │ own subscription│ │ │
  │  │  │ MachineOutput     │ │ MachineOutput     ││   │  │ MachineOutput   │ │ │
  │  │  └───────────────────┘ └───────────────────┘│   │  └─────────────────┘ │ │
  │  └──────────────────┬──────────────────────────┘   └─────────┬────────────┘ │
  │                     │                                        │              │
  └─────────────────────┼────────────────────────────────────────┼──────────────┘
                        │ one session, SignAndEncrypt            │ one session
  ┌─────────────────────┴──────────────────────┐   ┌─────────────┴──────────────┐
  │ gateway opc.tcp://opcgateway:11878         │   │ server of one machine      │
  │  ┌──────────────────┐ ┌──────────────────┐ │   │  ┌──────────────────────┐  │
  │  │ A0280O0001       │ │ A1121O0001       │ │   │  │ M3                   │  │
  │  │ TruLaser, i=3000 │ │ TruMatic, i=3000 │ │   │  │ opc.tcp://M3:4840    │  │
  │  └──────────────────┘ └──────────────────┘ │   │  └──────────────────────┘  │
  └────────────────────────────────────────────┘   └────────────────────────────┘
  OPC UA servers
```

| Part | Code | What it does |
|---|---|---|
| `MachineSupervisor` | [`MachineSupervisor.cs`](MachineSupervisor.cs) | Loads the registrations at start, adds, replaces and removes machines at run time, checks a registration against its server and against the core and the profiles of the data model ([`Mapping/DataModelProfiles.cs`](Mapping/DataModelProfiles.cs)). |
| `SessionPool` | [`OpcUa/SharedSession.cs`](OpcUa/SharedSession.cs) | One `SharedSession` per endpoint: the same address (case and a slash at the end do not count), security mode, security policy and server certificate. Opened with the first machine of the endpoint, closed with the last one. |
| `SharedSession` | [`OpcUa/SharedSession.cs`](OpcUa/SharedSession.cs) | Connects, watches the keep-alive, connects again with a back-off of 2 to 60 seconds. Attaches every machine to the session; a machine that cannot be attached is tried again every 30 seconds while the others go on. |
| `MachineConnection` | [`OpcUa/MachineConnection.cs`](OpcUa/MachineConnection.cs) | One per registered machine: its own subscription on the session, its heartbeat and its alarms, and whether it answers. Behind a gateway it keeps the alarms whose source or condition lies in one of its namespaces. A machine in `urn:umati2:datamodel:opcua` takes its alarms from the list `Notification.ActiveAlerts` instead of from events. |
| `MachineOutput` | [`Mapping/MachineOutput.cs`](Mapping/MachineOutput.cs) | One per registered machine: its own MQTT connection, with the client id `opcua-adapter-<machineId>` and its own last will, and the publisher of the binding the other adapters share. Turns the paths of the registration into those of the binding ([`Mapping/Topics.cs`](Mapping/Topics.cs)), builds the manifest, `State.Status`, `Notification.ActiveAlerts` and the alert events. |
| `MachineFinder`, `TrumpfMachines` | [`OpcUa/MachineFinder.cs`](OpcUa/MachineFinder.cs), [`OpcUa/TrumpfMachines.cs`](OpcUa/TrumpfMachines.cs) | Lists the machines of an endpoint for `opcua_machine_list`: every object with an `Identification` and a `SerialNumber`, and a TRUMPF machine by the root of its interface and its MachineTool instance `i=3000`. |
| `MachineChecks` | [`Registrations/MachineChecks.cs`](Registrations/MachineChecks.cs) | Refuses a registration that names no `machineNode` on a server of several machines, whose serial number is not the one read on the server, or that takes a node of another machine. |

### Topics

Every machine publishes under its machine id, `<manufacturer>_<model>_<serial number>`, after the
[binding of machines](../../contracts/mqtt/README.md#machines-the-binding-of-the-data-model):

| Topic below `machines/{machineId}/` | What | When |
|---|---|---|
| `umati/Manifest` | Profiles, elements, signals of the maker, alert events | At every connect to the broker, before the values |
| `umati/<Group>/<Element>` | An element of the data model, for example `umati/State/Status`, `umati/Channel/1/ChannelState` | On a change, with the time of the source |
| `oem/<Group>/<Element>` | A signal of the maker, for example `oem/ActivityMeters/DrivesOnDuration` (`x-trumpf-com.ActivityMeters.DrivesOnDuration` in the manifest) | On a change |
| `umati/Notification/ActiveAlerts` | The alarms that stand | When an alarm comes or goes |
| `umati/Connection/State` | `Initializing`, `Running`, `CommunicationFault` or `Shutdown` of this machine; `CommunicationFault` is also its last will | At the start, when the machine answers or stops answering, when the adapter stops |
| `umati/Connection/Heartbeat` | A count from 1 | Every ten seconds while the machine is registered, also while it does not answer |
| `events/notifications` | CloudEvents `Notification.AlertRaised` and `AlertCleared` | When an alarm condition becomes active or ends |

Two machines on one session publish under two machine ids, on two MQTT connections; nothing on the broker says
that they share a session. The timeseries persistence stores the values and the connection, the events
persistence the alarms.

## Where the configuration is kept

Everything that outlives a restart is in one directory, `Config:DataDirectory`, `/data` by default. In the
demo stack that is the Docker volume `opcua_adapter_data` (`pleiades-playground_opcua_adapter_data`), mounted
at `/data`. `docker compose down` keeps it; `docker compose down -v` deletes it, and with it every registration
and the certificate of the adapter.

```text
/data
├── machines/
│   └── <serial>.json        the registration of one machine
├── alerts/
│   └── <serial>.json        the alarms of that machine that stand
├── secrets/
│   └── credentials.json     the user and password of each server that wants one
└── pki/
    ├── certs/               the certificates of the adapter, public part (.der)
    └── private/             the same with their private keys (.pfx)
```

| What | Where | Written by | Read |
|---|---|---|---|
| Endpoint of a machine: `url`, `securityMode`, `securityPolicy`, `allowWeaker`, `user` | `machines/<serial>.json`, `endpoint` | [`RegistrationStore`](Registrations/RegistrationStore.cs), when a registration is added or replaced | At start and when the machine is added |
| Password of the user of a server | `secrets/credentials.json`, one entry per server address, readable by the adapter only (the folder `0700`, the file `0600`) | [`CredentialStore`](Registrations/CredentialStore.cs), when a person enters a user on the card in the chat (`PUT /users`) and the server accepted it | On every connect with that user, by the running machines and by a scan; never sent back |
| Certificate of the server, pinned | `machines/<serial>.json`, `endpoint.serverCertificateThumbprint` (SHA-1) | The adapter, from the certificate the server presented at the registration | On every connect: another certificate is refused, the machine says why in `lastError` |
| Identity of a machine: manufacturer, its web address, model, product instance URI, and the machine id of the topics | `machines/<serial>.json`, `identity` | The adapter, from the values read when the machine is added; for an older registration from its first values | At start: the topics, the last will and the source of the events |
| Machine on a server of several machines | `machines/<serial>.json`, `machineNode` | The registration | By the checks of a new registration, and by the alarm filter |
| Nodes, units, conversions, alarm type | `machines/<serial>.json`, `elements`, `alerts` | The registration, with the elements of the known mappings the adapter adds | When the machine is attached to its session |
| Profiles delivered, and the elements of profiles that are not complete | `machines/<serial>.json`, `profiles`, `missing` | The adapter, from the check of the core and the profiles, when it stores the registration | Checked again for the server list and the mapping review |
| Namespaces of the server at the scan | `machines/<serial>.json`, `discovery.namespaces` | The adapter, when it stores the registration | By a person who compares a rescan |
| Alarms that stand | `alerts/<serial>.json` | [`AlertStore`](Registrations/AlertStore.cs), on every change | At start, so an alarm that ended while the adapter was down is cleared, and one that still stands is raised again in the new run |
| Certificate of the adapter, the client certificate of every session | `pki/certs`, `pki/private`, one RSA certificate and ECC ones (NistP256, NistP384, BrainpoolP256r1, BrainpoolP384r1) | The OPC UA stack, at the first start, if there is none | On every connect and every scan |
| Application name and URI of the adapter | Not a file: `Pleiades Playground OPC UA Adapter` and `Config:ApplicationUri` (`urn:pleiades:playground:opcua:adapter`) | [`Program.cs`](Program.cs), at every start | They are in the certificate the stack creates |

The file name of a machine is its serial number, escaped as a URI. The registration is the
[sample](samples/trumpf-trumatic-k09.registration.json) in form, with the thumbprint, the namespaces, the
profiles and the elements of the known mappings the adapter added. Removing a machine deletes its file, its
standing alarms and its retained messages on the broker; what the stores kept of it stays.

What is not kept:

- **Sessions.** Held in memory and opened again at start, from the registrations.
- **Proposals of the chat.** In memory, for 30 minutes ([`DraftStore`](Registrations/DraftStore.cs)); a
  proposal is gone after a restart, and the server is scanned again.
- **A trust list of servers.** The stack accepts the certificate of every server; the adapter itself holds
  each machine to the thumbprint in its registration. A server that renews its certificate on purpose needs
  its machines registered again.
- **The scan sessions of the OPC UA MCP library.** In memory; they use the same certificate as the running
  machines, so a server trusts the adapter once for both.

The other side: a server, or a gateway, has to trust the certificate of the adapter once. Which file that is
depends on the server; for the UaGateway the certificate lies in `pki/pkiserver/rejected` after the first try
and is moved to `pki/pkiserver/trusted/certs`, see [the README](README.md#a-gateway-on-the-development-computer).

### Looking at it

```bash
docker run --rm -v pleiades-playground_opcua_adapter_data:/data alpine find /data
```

```bash
curl http://localhost:5560/machines/A1121O0001
```

The second one gives the stored registration of a machine together with what it does now.
