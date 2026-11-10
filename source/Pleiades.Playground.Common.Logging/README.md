# Pleiades.Playground.Common.Logging

This library provides a standardized logging configuration for Pleiades applications, built on top of Serilog.

## Features

- **Standardized Configuration**: Easy setup for console and other sinks.
- **Service Information**: Includes service name, version, and environment in logs.
- **HTTP Client Noise Reduction**: Automatically suppresses verbose `HttpClient` and Polly resilience logs at `Warning` level (configurable via `Serilog:MinimumLevel:Override` in `appsettings.json`).
- **Extensions**: Helper methods to configure logging in the `IHost` builder.

## Usage

### Basic Setup

In your `Program.cs` or `Startup.cs`:

```csharp
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Models;

var builder = WebApplication.CreateBuilder(args);

// Create ServiceInfo from the entry assembly and override with configuration if needed
var serviceInfo = typeof(Program).Assembly
    .CreateServiceInfo(builder.Environment.EnvironmentName)
    .UseConfiguration(builder.Configuration);

builder.Host.UsePleiadesLogging(serviceInfo, (loggerConfig, config) =>
{
    // Add additional sinks here
    // loggerConfig.WriteTo.Console(); // Console is added by default if not configured otherwise
});
```

### Configuration

The library uses `IConfiguration` to read settings. Ensure your `appsettings.json` or environment variables are set up correctly if you use configuration-based settings.
