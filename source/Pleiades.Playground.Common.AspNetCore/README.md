# Pleiades.Playground.Common.AspNetCore

This library provides common ASP.NET Core extensions and utilities for Pleiades applications.

## Features

- **CORS Policies**: Standardized CORS configuration for Pleiades APIs.
- **HTTP JSON Options**: Configures Minimal API JSON serialization with Pleiades defaults.
- **Forwarded Headers**: Standardized reverse-proxy header handling, including
  `X-Forwarded-Prefix` mapping into `Request.PathBase` for path-based proxy
  routing (NGINX sub-paths, Traefik `StripPrefix`, …).
- **Swagger UI**: Drop-in helper that registers Swashbuckle's Swagger UI with a
  page-relative OpenAPI document URL so the UI works transparently both
  directly and behind a path-stripping reverse proxy.

## Usage

### HTTP JSON Options

Configures `HttpJsonOptions` (used by Minimal API endpoints for request body binding and response serialization) with Pleiades defaults including `JsonStringEnumConverter`.

This is the Minimal API counterpart to `AddPleiadesDefaultJsonOptions()` from `Pleiades.Playground.Common.Json`, which only configures `IOptions<JsonSerializerOptions>`.

```csharp
using Pleiades.Playground.Common.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Configure Minimal API JSON serialization with Pleiades defaults
builder.Services.AddPleiadesHttpJsonOptions();
```

If you need additional domain-specific converters, pass a `configure` callback.
The UG defaults are applied first, then your callback runs on the same
`JsonSerializerOptions`, so everything is registered in a single call:

```csharp
builder.Services.AddPleiadesHttpJsonOptions(options =>
{
    options.Converters.Add(new JsonChannelConverter());
});
```

### CORS

The library provides methods to add and use a default CORS policy that allows any origin, any header, and any method. This is useful for development and internal APIs.

#### Add Services

In `Program.cs`:

```csharp
using Pleiades.Playground.Common.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Add default CORS policy
builder.Services.AddPleiadesDefaultCors();
```

#### Use Middleware

```csharp
var app = builder.Build();

// Use default CORS policy
app.UsePleiadesDefaultCors();
```

### Forwarded Headers (Reverse Proxy)

When the API runs behind a reverse proxy (NGINX, Traefik, ingress controller, …)
that performs TLS termination and/or path-based routing, the application has to
honor the `X-Forwarded-*` headers. Otherwise generated URLs (Swagger UI,
`Location` headers, redirects, the OpenAPI document's `servers` entry) are
wrong, and the proxy's path prefix leaks into the application.

```csharp
using Pleiades.Playground.Common.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Trust X-Forwarded-For / -Proto / -Host / -Prefix from any proxy on the
// container network. KnownProxies / KnownNetworks are cleared.
builder.Services.AddPleiadesForwardedHeaders();

var app = builder.Build();

// Apply the headers and project X-Forwarded-Prefix into Request.PathBase so
// the application is transparent to the proxy's path prefix.
app.UsePleiadesForwardedHeaders();
```

This must run **before** any middleware or endpoint that produces URLs
(`UseSwaggerUI`, `MapOpenApi`, redirects, …).

When using path-based proxy routing such as Traefik's `StripPrefix` middleware
or NGINX `proxy_pass http://upstream/;` with a sub-path, configure the proxy
to send `X-Forwarded-Prefix: /<your-prefix>` and the helper above takes care
of the rest. To make the Swagger UI also work with a path prefix, use the
`UsePleiadesSwaggerUI` helper described below.

### Swagger UI (proxy-friendly)

`UsePleiadesSwaggerUI` registers Swashbuckle's Swagger UI middleware
with a page-relative OpenAPI document URL. That single change makes the UI
work transparently both for direct access (`http://localhost:5xxx/`) and behind
a reverse proxy that strips a path prefix (Traefik `StripPrefix`, NGINX
`proxy_pass` with a sub-path, …) — no extra configuration, no document
transformer, no custom `IndexStream` required.

```csharp
using Pleiades.Playground.Common.AspNetCore;

var app = builder.Build();

app.UsePleiadesForwardedHeaders();

app.MapOpenApi(); // serves /openapi/v1.json

// UI at the application root (default). Spec URL becomes "openapi/v1.json".
app.UsePleiadesSwaggerUI($"{serviceInfo.Name} - V {serviceInfo.Version}");

// Alternative: UI at /swagger. Spec URL becomes "../openapi/v1.json".
// app.UsePleiadesSwaggerUI(
//     documentTitle: $"{serviceInfo.Name} - V {serviceInfo.Version}",
//     routePrefix: "swagger");
```

#### Why page-relative?

Swashbuckle's `index.js` contains a workaround for
[swagger-api/swagger-ui#5945](https://github.com/swagger-api/swagger-ui/issues/5945)
that resolves *page-relative* spec URLs against the served `index.html`:

```js
// excerpt from Swashbuckle.AspNetCore.SwaggerUI/index.js
configObject.urls.forEach(function (item) {
    if (item.url.startsWith("http") || item.url.startsWith("/")) return;
    item.url = window.location.href.replace("index.html", item.url).split('#')[0];
});
```

A URL with a leading slash (`"/openapi/v1.json"`) is treated as absolute and
**bypasses** the workaround — which breaks the UI behind a path-stripping
reverse proxy, because the browser then asks the proxy for `/openapi/v1.json`
instead of `/<prefix>/openapi/v1.json`. Returning the URL **without** a
leading slash triggers the workaround and produces the correct absolute URL
on both direct and proxied access.

The OpenAPI document's `servers[]` entry is taken care of automatically by
`Microsoft.AspNetCore.OpenApi`, which builds it from
`Request.Scheme`/`Host`/`PathBase` — and `PathBase` is set correctly by
`UsePleiadesForwardedHeaders` from the `X-Forwarded-Prefix` header.
Therefore no custom `IOpenApiDocumentTransformer` is needed.
