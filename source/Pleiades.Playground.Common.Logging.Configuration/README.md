# Pleiades.Playground.Common.Logging.Configuration

This library provides tools for logging configuration objects safely, with support for redaction of sensitive information.

## Features

- **Configuration Logging**: Log the startup configuration of your application.
- **Redaction**: Mask sensitive properties (like connection strings, passwords) using built-in or custom redactors.
- **JSON Path Support**: Redact properties based on JSON paths.

## Usage

### Log Configuration on Startup

```csharp
using Pleiades.Playground.Common.Logging.Configuration;
using Microsoft.Extensions.Options;

var app = builder.Build();

var logger = app.Services.GetRequiredService<ILogger<Program>>();
var config = app.Services.GetRequiredService<IOptions<MyConfig>>();

logger.LogConfiguration(config.Value, redactor => redactor
    .Redact(c => c.MongoDbConnectionString, BuiltInRedactors.MaskPartial)
    .Redact(c => c.SecretKey, BuiltInRedactors.MaskFull));
```

### Built-in Redactors

- `BuiltInRedactors.MaskFull`: Replaces the entire string with `***`.
- `BuiltInRedactors.MaskPartial`: Shows the first few characters and masks the rest.
