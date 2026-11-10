using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.AspNetCore;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.AspNetCore;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.Common.Logging.Loki;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Timeseries.Api;
using Pleiades.Playground.Timeseries.Api.Endpoints;
using Pleiades.Playground.Timeseries.Api.HealthChecks;
using Pleiades.Playground.Timeseries.Api.Extensions;
using Pleiades.Playground.Timeseries.Api.Utils;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.Mcp.Server;

var assembly = typeof(Program).Assembly;
var builder = WebApplication.CreateBuilder(args);
var serviceInfo = assembly.CreateServiceInfo(builder.Environment.EnvironmentName).UseConfiguration(builder.Configuration);

builder.Host.UsePleiadesLogging(serviceInfo, (loggerConfig, config) =>
{
    loggerConfig.WriteToLoki(config, serviceInfo, "Config:Loki");
});

// Bind and validate configuration
builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
    .ValidateDataAnnotations()
    .ValidateOnStart();

// Configure Kestrel server limits
builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Limits.MaxRequestBodySize = 524288000; // 500 MB
});

// Add services to the container
builder.Services.ConfigureMongoTimeseries();

builder.Services.AddPleiadesForwardedHeaders();

builder.Services.AddPleiadesDefaultCors();

builder.Services.AddPleiadesHttpJsonOptions();

// Zero-trust: validate the Keycloak access token per request and gate endpoints on the
// flat `roles` claim (resource permission `timeseries:read` / `timeseries:write`). Trusted
// service-to-service callers (e.g. the persistence worker) carry no user token and authenticate
// with the internal API key instead — both read the same Config:Auth section.
var authSection = builder.Configuration.GetSection("Config:Auth");
builder.Services.AddPleiadesJwtAuth(authSection, builder.Environment);
builder.Services.AddPleiadesFeatureAuthorization(authSection, TimeseriesFeature.Name);

builder.Services.AddOptions<QueryLimitsSettings>()
    .BindConfiguration("Config:QueryLimits")
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddSingleton<IQueryParameterUtils, QueryParameterUtils>();
builder.Services.AddHealthChecks()
    .AddCheck<MongoTimeseriesHealthCheck>("mongo-timeseries")
    // Reports the authorization posture on the /healthcheck monitoring already polls, instead of in
    // one startup log line. The entry is Healthy in BOTH directions and carries the state
    // in Data["authenticationEnabled"] - read the flag, never the status. It reported Degraded when
    // auth was off in earlier versions, and ASP.NET logs any non-Healthy result at Warning on EVERY
    // evaluation: a value that cannot change while the process lives was re-asserted 8,640 times a
    // day per service at the 10 s probe interval. Nothing operational changed - Degraded already
    // mapped to 200 and only Unhealthy maps to 503.
    .AddPleiadesAuthStatus();

// MCP server for AI agents, on the Pleiades standard (Pleiades.Playground.Mcp.Server): stamped version,
// stateless transport, instructions incl. the OpenAPI link (served in every environment),
// and the timeseries_describe_server / timeseries_get_skill_guide tools plus timeseries://skill from
// Resources/skill.md. The tools serialize with the HTTP JSON options above, as REST does.
builder.Services
    .AddPleiadesMcpServer(mcp =>
    {
        mcp.Prefix = "timeseries";
        mcp.Name = "Pleiades-Timeseries";
        mcp.Title = "Timeseries API MCP server for industrial machine sensor time-series data.";
        mcp.Domains.Add("Base Unit Values: Numeric sensor data with physical units (force, temperature, speed, etc.)");
        mcp.Domains.Add("String Values: Text-based time-series (status messages, states)");
        mcp.Domains.Add("Boolean Values: Digital signals (on/off, limit switches)");
        mcp.Domains.Add("Topics: Data source discovery");
        mcp.Domains.Add("Statistics: Aggregated values (min, max, mean, count) across time windows");
        mcp.DiscoveryFlow.Add("Use timeseries_topics_query to discover available topics in a time range.");
        mcp.DiscoveryFlow.Add("Use timeseries_baseunit_query / timeseries_string_query / timeseries_boolean_query to load data.");
        mcp.DiscoveryFlow.Add("Use timeseries_statistics_query for aggregated comparisons.");
        mcp.WritePolicy = FeaturePolicy.Write(TimeseriesFeature.Name);
    })
    .WithPleiadesToolsFromAssembly();

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, _, _) =>
    {
        document.Info.Title = serviceInfo.Name;
        document.Info.Version = serviceInfo.Version;
        document.Info.Description = "Timeseries REST API";
        document.Info.Contact = new()
        {
            Name = "Pleiades contributors"
        };
        return Task.CompletedTask;
    });
});

var app = builder.Build();

var logger = app.Services.GetRequiredService<ILogger<Program>>();
var config = app.Services.GetRequiredService<IOptions<Config>>();

logger.LogConfiguration(
    config.Value,
    redactor => redactor
        .Redact(c => c.MongoTimeseries.ConnectionString, BuiltInRedactors.MongoConnectionString)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Username, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Password, BuiltInRedactors.MaskAll));

app.UsePleiadesForwardedHeaders();

// Order: forwarded headers -> request logging -> CORS -> auth. TWO rules meet here, and each one on
// its own argues for a different place. Only this order satisfies both, so both are written down.
//
// (1) Request logging goes FIRST of the short-circuitable middleware - before UsePleiadesAuth()
// AND before CORS. UseSerilogRequestLogging is a wrapper: it calls next() and logs afterwards, so it
// only sees responses produced further down the pipeline. Registered after the auth middleware (as it
// was until 2026-08-27), every 401/403 the authorization middleware short-circuits was INVISIBLE in
// the request log - a misconfigured client, an expired key or a probing caller left no trace at all.
// Found while enabling auth in the integration stack; the tests assert the 401, the log did
// not show it.
//
// (2) CORS goes BEFORE auth. A 401 or 403 short-circuits the pipeline, so with CORS registered after
// the auth middleware the refusal never passes through it and carries no Access-Control-Allow-*
// headers - a browser client then sees an opaque CORS error instead of the 401 it could act on. That
// is why ASP.NET Core puts UseCors ahead of authentication. Pinned by ARequestWithAnOrigin... in
// ApiAuthorizationViaStackTest, which was RED on the previous order.
//
// Forwarded headers stay first either way: the log enricher reads X-Forwarded-For, scheme and host,
// and behind a reverse proxy those are only correct once the forwarded headers have been applied.
app.UsePleiadesRequestLogging();

app.UsePleiadesDefaultCors();

app.UsePleiadesAuth();

// No UseDeveloperExceptionPage() here: WebApplication registers it itself when the environment is
// Development, and this API builds with WebApplication.CreateBuilder. The explicit call was a
// duplicate, and the environment switch existed only to guard it - so the switch goes with it.

app.MapPleiadesLiveness();
app.MapPleiadesHealthChecks();

app.MapOpenApi();
app.UsePleiadesSwaggerUI($"{serviceInfo.Name} - V {serviceInfo.Version}");

app.MapGroup("timeseries").MapTimeseries();
app.MapGroup("topics").MapTopics();
app.MapGroup("statistics").MapStatistics();

// MCP tool discovery/queries are reads; the internal API key satisfies the read policy.
// Non-prod (auth disabled) stays anonymous. The group covers /mcp and GET /skill.
app.MapPleiadesMcp().RequireFeatureRead(TimeseriesFeature.Name);

await app.RunAsync().ConfigureAwait(false);
