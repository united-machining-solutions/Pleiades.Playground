# Pleiades.Playground.Bend.Protocol

The telegrams of a bending machine that reports over the file based **RCI** interface, for both sides: the machine
(the [bending simulator](../Pleiades.Playground.Bend.Simulator/README.md)) writes them, the host (the
[bending adapter](../Pleiades.Playground.Bend.Adapter/README.md)) reads them.

The machine writes each message as a file `RCIMaschToServ<n>.xml` into an exchange folder (RCI interface
description, chapter 4.2). The root is `RCIInterface`; a timestamp is local time of the machine,
`yyyy.MM.dd HH:mm:ss`, without an offset. Commands of the host (chapter 4.1) are not part of this library: the
simulator only sends.

| Folder | What |
|---|---|
| `Model/` | Production package and manufacturing order, as the telegrams carry them; operating, order and package states with their codes |
| `Telegrams/` | `RciTelegram` and its messages; `RciTelegramWriter` (machine side); `RciTelegramParser` and the observations it gives (host side) |
| `Transport/` | `RciChannelOptions` (folder and file name); `RciExchangeDirectory`, which finds files that are new or written again |

The writer goes on after the highest running number in the folder, so a restart overwrites nothing, and writes each
file under another name first, so a host never reads half a file. The files keep the shape of the machine: CRLF line
breaks, interface version 3.2, the same elements in the same order.
