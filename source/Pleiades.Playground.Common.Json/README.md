# Pleiades.Playground.Common.Json

Common `JsonSerializerOptions` defaults and extensions for Pleiades services.

## Features

- **`PleiadesDefaultJsonOptions`**: Shared static `JsonSerializerOptions` instance with Pleiades conventions (camelCase, case-insensitive, `JsonStringEnumConverter`).
- **`SetPleiadesDefaults()`**: Applies all Pleiades defaults including `JsonStringEnumConverter`.
- **`SetPleiadesBaseDefaults()`**: Applies Pleiades defaults **without** `JsonStringEnumConverter` (for consumers that need numeric enums).
- **`AddPleiadesDefaultJsonOptions()`**: Registers Pleiades defaults into `IOptions<JsonSerializerOptions>`.

## Usage

### Direct serialization (MQTT, HttpClient, etc.)

```csharp
using Pleiades.Playground.Common.Json;

// Use the shared static instance
var json = JsonSerializer.Serialize(data, JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions);
```

### Worker / Service with IOptions

```csharp
// In Program.cs
builder.Services.AddPleiadesDefaultJsonOptions();

// In a service
public class MyWorker(IOptions<JsonSerializerOptions> options)
{
    private readonly JsonSerializerOptions _jsonOptions = options.Value;
}
```

### Without JsonStringEnumConverter

For APIs that expect numeric enums (e.g., Notification Service API):

```csharp
var options = new JsonSerializerOptions().SetPleiadesBaseDefaults();
// options has camelCase, case-insensitive, AllowNamedFloatingPointLiterals
// but NO JsonStringEnumConverter
```

### ASP.NET Core Minimal APIs

For configuring Minimal API HTTP JSON serialization, use `AddPleiadesHttpJsonOptions()` from `Pleiades.Playground.Common.AspNetCore`.

> **Note**: `AddPleiadesDefaultJsonOptions()` configures `IOptions<JsonSerializerOptions>` which is **not** used by Minimal API endpoints. Use `AddPleiadesHttpJsonOptions()` for that.
