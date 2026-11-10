using System.Text.Json.Nodes;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi;
using Pleiades.Playground.Common.AspNetCore;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.AspNetCore;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.Common.Logging.Loki;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Events.Api;
using Pleiades.Playground.Events.Api.Endpoints;
using Pleiades.Playground.Events.Api.Extensions;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.MongoDb;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Notification.DataTransferObjects;

var assembly = typeof(Program).Assembly;

var builder = WebApplication.CreateBuilder(args);

var serviceInfo = assembly
    .CreateServiceInfo(builder.Environment.EnvironmentName)
    .UseConfiguration(builder.Configuration);

builder.Host.UsePleiadesLogging(serviceInfo, (loggerConfig, config) =>
{
    loggerConfig.WriteToLoki(config, serviceInfo, "Config:Loki");
});

// Bind and validate configuration
builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.ConfigureMongoDb();

// MCP server for AI agents, built on Pleiades.Playground.Mcp.Server: stamped version,
// stateless transport, instructions incl. the OpenAPI link (served in every environment),
// and the events_describe_server / events_get_skill_guide tools plus events://skill from
// Resources/skill.md. The tools serialize with the HTTP JSON options below, as REST does.
builder.Services
    .AddPleiadesMcpServer(mcp =>
    {
        mcp.Prefix = "events";
        mcp.Name = "Pleiades-Events";
        mcp.Title = "Events API MCP server for industrial machine event analysis.";
        mcp.Domains.Add("Notification events");
        mcp.DiscoveryFlow.Add("Use the events_* query tools for filtered event retrieval and analysis.");
        mcp.WritePolicy = FeaturePolicy.Write(EventsFeature.Name);
    })
    .WithPleiadesToolsFromAssembly();

builder.Services.AddPleiadesForwardedHeaders();

builder.Services.AddPleiadesDefaultCors();

builder.Services.AddPleiadesHttpJsonOptions();

// Zero-trust: validate the Keycloak access token per request and gate endpoints on the
// flat `roles` claim (resource permission `events:read` / `events:write`). Trusted
// service-to-service callers carry no user token and authenticate with the internal API
// key instead — both read the same Config:Auth section.
var authSection = builder.Configuration.GetSection("Config:Auth");
builder.Services.AddPleiadesJwtAuth(authSection, builder.Environment);
builder.Services.AddPleiadesFeatureAuthorization(authSection, EventsFeature.Name);

builder.Services.AddHealthChecks()
    .AddMongoDb()
    // Reports the authorization posture on /healthcheck instead of in one startup log line. The
    // entry is Healthy in BOTH directions and carries the state in Data["authenticationEnabled"] -
    // read the flag, never the status. ASP.NET logs any non-Healthy result at Warning on EVERY
    // evaluation, so a Degraded entry for "auth off" would re-assert a value that cannot change
    // while the process lives 8,640 times a day per service at a 10 s probe interval.
    .AddPleiadesAuthStatus();
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, _, _) =>
    {
        document.Info = new()
        {
            Version = serviceInfo.Version,
            Title = serviceInfo.Name,
            Description = "Events REST API",
            Contact = new()
            {
                Name = "Pleiades contributors"
            }
        };
        return Task.CompletedTask;
    });

    options.AddSchemaTransformer((schema, context, _) =>
    {
        if (context.JsonTypeInfo.Type == typeof(NotificationAction))
        {
            schema.Type = JsonSchemaType.String;
            schema.Enum =
            [
                JsonValue.Create("None"),
                JsonValue.Create("Raised"),
                JsonValue.Create("Reset")
            ];
        }
        return Task.CompletedTask;
    });
});

var app = builder.Build();

// Log sanitized configuration at startup
var logger = app.Services.GetRequiredService<ILogger<Program>>();
var config = app.Services.GetRequiredService<IOptions<Config>>();

logger.LogConfiguration(
    config.Value,
    redactor => redactor
        .Redact(c => c.MongoDb.ConnectionString, BuiltInRedactors.MongoConnectionString)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Username, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Password, BuiltInRedactors.MaskAll));

app.UsePleiadesForwardedHeaders();

// Order: forwarded headers -> request logging -> CORS -> auth. TWO rules meet here, and each one on
// its own argues for a different place. Only this order satisfies both, so both are written down.
//
// (1) Request logging goes FIRST of the short-circuitable middleware - before UsePleiadesAuth()
// AND before CORS. UseSerilogRequestLogging is a wrapper: it calls next() and logs afterwards, so it
// only sees responses produced further down the pipeline. Registered after the auth middleware,
// every 401/403 the authorization middleware short-circuits would be INVISIBLE in the request log -
// a misconfigured client, an expired key or a probing caller would leave no trace at all.
//
// (2) CORS goes BEFORE auth. A 401 or 403 short-circuits the pipeline, so with CORS registered after
// the auth middleware the refusal never passes through it and carries no Access-Control-Allow-*
// headers - a browser client then sees an opaque CORS error instead of the 401 it could act on. That
// is why ASP.NET Core puts UseCors ahead of authentication.
//
// Forwarded headers stay first either way: the log enricher reads X-Forwarded-For, scheme and host,
// and behind a reverse proxy those are only correct once the forwarded headers have been applied.
app.UsePleiadesRequestLogging();

app.UsePleiadesDefaultCors();

app.UsePleiadesAuth();

// No UseDeveloperExceptionPage() here: WebApplication registers it itself when the environment is
// Development, and this API builds with WebApplication.CreateBuilder. An explicit call would be a
// duplicate, and an environment switch would exist only to guard it.

app.MapPleiadesLiveness();
app.MapPleiadesHealthChecks();

app.MapOpenApi();
app.UsePleiadesSwaggerUI($"{serviceInfo.Name} - V {serviceInfo.Version}");

var notificationEvents = app.MapGroup("notificationEvents").WithTags("Notification Events");
notificationEvents.MapNotificationEvents();
notificationEvents.MapNotificationEventStatistics();

// MCP tool discovery/queries are reads; the internal API key satisfies the read policy.
// Non-prod (auth disabled) stays anonymous. The group covers /mcp and GET /skill.
app.MapPleiadesMcp().RequireFeatureRead(EventsFeature.Name);

await app.RunAsync().ConfigureAwait(false);
