# Pleiades.Playground.Common.Logging.Loki

This library provides a pre-configured Serilog sink for Grafana Loki, tailored for Pleiades environments.

## Features

- **Loki Integration**: Easy setup to send logs to a Loki instance.
- **Authentication**: Supports Basic Auth.
- **Labels**: Automatically adds service labels to logs.

## Usage

### Add Loki Sink

In your `Program.cs` setup with `UsePleiadesLogging`:

```csharp
using Pleiades.Playground.Common.Logging.Loki;

builder.Host.UsePleiadesLogging(serviceInfo, (loggerConfig, config) =>
{
    loggerConfig.WriteToLoki(config, serviceInfo, "Config:Loki");
});
```

### Configuration

Ensure your configuration (e.g., `appsettings.json`) contains the Loki settings in the section expected by `WriteToLoki` (default is "Loki"):

```json
{
  "Loki": {
    "EnableDiagnostics": false,
    "Sinks": [
      {
        "Name": "MainLoki",
        "Enabled": true,
        "Uri": "https://loki.example.com",
        "BasicAuth": {
            "Username": "...",
            "Password": "..."
        },
        "QueueLimit": 5000,
        "BatchPostingLimit": 1000,
        "Period": "00:00:02"
      }
    ]
  }
}
```

### Memory Safety (QueueLimit)

The underlying `Serilog.Sinks.Grafana.Loki` sink queues log events in memory when Loki is unreachable. **Without a queue limit, this causes unbounded memory growth and eventual OutOfMemoryException.**

This library defaults `QueueLimit` to **5000** events per sink (safe-by-default). When the queue is full, new events are dropped with a diagnostic warning (enable `SelfLog` / `EnableDiagnostics` to see these).

You can override this per sink:
- `"QueueLimit": 10000` — larger buffer for high-throughput services
- `"QueueLimit": null` — unlimited (not recommended, matches upstream default)

**Important Notes:**
- Use `"Uri"` (not `"Url"`) for the Loki endpoint - this ensures type safety with `System.Uri`
- The extension method `WriteToLoki` reads this custom configuration structure to configure one or multiple Loki sinks
