# About the name

Pleiades is named after a star cluster. This page says where the name comes from, what it stands for, what it
deliberately does not stand for, and how to write it.

Pleiades is an idea in the making, and this playground tries it in code. Who hosts and governs a foundation of
that name is not decided.

## Where the name comes from

The Pleiades are an open star cluster in the constellation Taurus, catalogued as Messier 45 and also called the
Seven Sisters. The cluster holds more than a thousand stars; six or seven of them can be seen without a
telescope. Each star is its own, and together they are one of the best-known sights in the night sky.

That is the picture behind the name: many stars, one sky, one open foundation.

| Picture | What it stands for |
|---|---|
| Many stars | Independent manufacturers, technologies and brands stay visible and keep competing |
| One sky | Shared rules, a shared meaning of data and shared building blocks let their systems work together |
| One foundation | A base that stays out of sight: it owns neither the access to customers nor the value created on top |

Pleiades does not unite the companies. It connects their digital foundations.

## What Pleiades is

Pleiades is the name for an open digital foundation for manufacturing. The word is foundation, not platform: a
platform gathers customers and applications at one operator, a foundation provides the common technical base and
stays neutral towards the applications and business models built on it.

It aims to be:

- **Open source.** The shared core is transparent and developed together.
- **Sovereign.** Data, access rights and decisions on use stay with the customer.
- **Secure.** Security by design, software that can be updated, clear responsibilities.
- **Open to technologies.** Existing machines first: standards and proprietary systems that are in the field are
  integrated.
- **Federated.** Nobody has to use a central cloud or a central data store.
- **Extensible.** A shared semantic core, and extensions for each domain.

## What Pleiades is not

- **No app store.** Nobody controls centrally which applications a customer uses.
- **No customer portal.** The direct relationship between a manufacturer and its customer stays theirs.
- **No central data store.** Data stays in federated places that the customer controls.
- **No uniform product.** It replaces neither a manufacturer's software nor its user experience nor the services
  that set it apart.
- **No new standard above the others.** Existing standards are connected and made to fit together in meaning.
- **No dominant operator.** No single party is meant to control it.

Pleiades enables markets. It does not become the marketplace.

## Taurus, Pleiades and this playground

In the sky the Pleiades lie in Taurus. The picture uses that: Taurus is the name for the layer that reaches the
machines, and Pleiades is the foundation on top of it.

| Layer | Name | What happens there |
|---|---|---|
| Applications and business models | each manufacturer's own | Applications, services and AI: here manufacturers differ and compete |
| Open digital foundation | Pleiades | Identities, semantics, security, data rights, updates and open-source building blocks |
| Technology-open access | Taurus | Translates, normalises and secures what machines speak: OPC UA, MQTT, MTConnect, the interfaces of controls |
| Production systems | | Machines, robots, material flow and software of many generations |

Taurus connects, Pleiades enables, and the industry differentiates.

This repository is the playground: the place where the idea is tried in code, at a small scale and without a
promise of stability. It covers a part of the picture, not all of it:

| In the picture | In this repository |
|---|---|
| Access to machines (Taurus) | A simulator stands in for adapters and publishes to the broker, see [`contracts/mqtt`](../contracts/mqtt/README.md) |
| Shared building blocks (Pleiades) | The contracts under [`contracts/`](../contracts/README.md) and the services that offer time series and events over REST and MCP |
| Applications | The example app under `apps/`, as one of many that could be built on the same tools |

The playground does not cover the whole picture: data rights and updates, for example, are not in it. What
proves itself here moves out and drops the `Playground` segment of its name, see
[ADR-0003](adr/0003-naming.md).

## How to write and say it

- In text, write **Pleiades** and **Taurus** like any other name: a capital first letter and no article.
  "The Pleiades", with the article, is the star cluster.
- The names are not acronyms. In capitals (PLEIADES, TAURUS) they appear only as a wordmark, for example in a
  logo or on a title slide.
- This repository is the **Pleiades Playground**.
- In an identifier the place decides the form: `Pleiades.Playground.<Area>.<Part>` in .NET,
  `pleiades.playground.<area>.<part>` for images, `PLEIADES_` in front of a setting. See
  [ADR-0003](adr/0003-naming.md).
- Say it "PLEE-uh-deez". "PLY-uh-deez" is just as correct; dictionaries list both.
