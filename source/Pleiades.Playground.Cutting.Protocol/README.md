# Pleiades.Playground.Cutting.Protocol

The telegram protocol of the cutting machines, for both sides, the machine and the host: telegrams, the file
transport, and what each machine type supports. The
[cutting simulator](../Pleiades.Playground.Cutting.Simulator/README.md) uses it as a machine; an adapter that
reads a machine uses it as a host.

| Folder | What is in it |
|---|---|
| `Telegrams/` | `CuttingTelegram` (request and reply), `CuttingNotification`, `CuttingTelegramParser`, `CuttingReplyBuilder` for replies split into `A` and `L` telegrams, `CuttingFormat` for timestamps and fields |
| `Transport/` | `CuttingFileChannel`: the telegram files and their `.rd` and `.wr` semaphores (§2.2), polled, without a file system watcher |
| `Model/` | Machine types, commands, return codes, order status, the fields of every notification, and `CuttingSupport`, which says which type supports what |

A host in a few lines:

```csharp
using var channel = new CuttingFileChannel(new CuttingChannelOptions { Directory = "/exchange", Role = CuttingRole.Host });
await channel.SendAsync([CuttingTelegram.Request(CuttingCommands.Connect, 1, "2.1.0")]);

foreach (var line in await channel.ReceiveAsync())     // poll this
{
    var message = CuttingTelegramParser.Parse(line);    // CuttingTelegram or CuttingNotification
}
```

The writer follows the offsets of §2.3: the header is 34 characters, then `|`. The reader is lenient. It finds
the `|`, because the examples of the specification put two more characters before it. It also keeps fields
beyond the ones it knows. Field numbers are 1-based as in the specification: `message.Field(1)` is the
machine number.
