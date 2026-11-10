# Pleiades.Playground.Common.Logging.AspNetCore

This library extends `Pleiades.Playground.Common.Logging` with ASP.NET Core specific features, primarily request logging.

## Features

- **Request Logging**: Middleware to log HTTP requests with detailed information.
- **Enrichment**: Adds `RequestId`, `ClientIP`, `UserAgent`, `FullUrl`, and `QueryParams` to the log context.
- **Health Check Filtering**: Automatically filters out logs from `/healthcheck` endpoints to reduce noise.

## Usage

### Enable Request Logging

In your `Program.cs`, after building the app:

```csharp
using Pleiades.Playground.Common.Logging.AspNetCore;

var app = builder.Build();

// ... other middleware ...

app.UsePleiadesRequestLogging();

// ... map endpoints ...
```

This should be placed early in the middleware pipeline, but after `UseStaticFiles` if you don't want to log static file requests (or before if you do).
