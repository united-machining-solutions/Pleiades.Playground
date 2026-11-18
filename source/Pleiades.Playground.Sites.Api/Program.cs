using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.AspNetCore;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.AspNetCore;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.Common.Logging.Loki;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.MongoDb;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Sites.Api;
using Pleiades.Playground.Sites.Api.Endpoints;
using Pleiades.Playground.Sites.Api.Services;

var assembly = typeof(Program).Assembly;

var builder = WebApplication.CreateBuilder(args);

var serviceInfo = assembly
    .CreateServiceInfo(builder.Environment.EnvironmentName)
    .UseConfiguration(builder.Configuration);

builder.Host.UsePleiadesLogging(serviceInfo, (loggerConfig, config) =>
{
    loggerConfig.WriteToLoki(config, serviceInfo, "Config:Loki");
});

builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.ConfigureMongoDb();
builder.Services.AddSingleton(TimeProvider.System);

// MCP server on Pleiades.Playground.Mcp.Server, read-only: the sites_* tools of McpTools plus
// sites_describe_server / sites_get_skill_guide and sites://skill from Resources/skill.md.
builder.Services
    .AddPleiadesMcpServer(mcp =>
    {
        mcp.Prefix = "sites";
        mcp.Name = "Pleiades-Sites";
        mcp.Title = "Sites API MCP server: where the machines stand, by site and hall.";
        mcp.Domains.Add("Sites (company, plant, halls) and the machines placed on them");
        mcp.DiscoveryFlow.Add("Use sites_site_list for the places and sites_placement_list for the machines on them.");
        mcp.WritePolicy = FeaturePolicy.Write(SitesFeature.Name);
    })
    .WithPleiadesToolsFromAssembly();

builder.Services.AddPleiadesForwardedHeaders();

builder.Services.AddPleiadesDefaultCors();

builder.Services.AddPleiadesHttpJsonOptions();

// Reading needs sites:read, writing sites:write (Keycloak roles of the token), or the internal API key of a
// trusted service; with Config:Auth:Enabled false, as in the demo stack, both are open.
var authSection = builder.Configuration.GetSection("Config:Auth");
builder.Services.AddPleiadesJwtAuth(authSection, builder.Environment);
builder.Services.AddPleiadesFeatureAuthorization(authSection, SitesFeature.Name);

builder.Services.AddHealthChecks()
    .AddMongoDb()
    .AddPleiadesAuthStatus();

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, _, _) =>
    {
        document.Info = new()
        {
            Version = serviceInfo.Version,
            Title = serviceInfo.Name,
            Description = "Sites REST API: sites and the machines placed on them",
            Contact = new()
            {
                Name = "Pleiades contributors"
            }
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
        .Redact(c => c.MongoDb.ConnectionString, BuiltInRedactors.MongoConnectionString)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Username, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Password, BuiltInRedactors.MaskAll));

// Order as in the Events API: forwarded headers, request logging (sees the 401/403 the auth middleware
// short-circuits), CORS (so a refusal carries its headers), auth.
app.UsePleiadesForwardedHeaders();
app.UsePleiadesRequestLogging();
app.UsePleiadesDefaultCors();
app.UsePleiadesAuth();

app.MapPleiadesLiveness();
app.MapPleiadesHealthChecks();

app.MapOpenApi();
app.UsePleiadesSwaggerUI($"{serviceInfo.Name} - V {serviceInfo.Version}");

app.MapGroup("sites").WithTags("Sites").MapSites();
app.MapGroup("placements").WithTags("Placements").MapPlacements();

// Every tool is a read; the group covers /mcp and GET /skill.
app.MapPleiadesMcp().RequireFeatureRead(SitesFeature.Name);

await app.RunAsync().ConfigureAwait(false);
