using Microsoft.Extensions.Diagnostics.HealthChecks;
using Pleiades.Playground.Common.AspNetCore;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.JuiceBar.Api;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;

const string Feature = "juicebar";

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOptions<JuiceBarOptions>().BindConfiguration("JuiceBar")
    .Validate(o => Uri.TryCreate(o.BaseUrl, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) && string.IsNullOrEmpty(uri.UserInfo),
        "JuiceBar:BaseUrl must be an HTTP(S) URL without credentials.")
    .Validate(o => o.MaximumQueueLength is >= 1 and <= 20, "JuiceBar:MaximumQueueLength must be 1..20.")
    .Validate(o => new[] { o.ManufacturerName, o.Model, o.SerialNumber }.All(part => !string.IsNullOrWhiteSpace(part)),
        "JuiceBar:ManufacturerName, JuiceBar:Model and JuiceBar:SerialNumber must each be nonempty.")
    .Validate(o => Uri.TryCreate(o.ManufacturerUri, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) && !string.IsNullOrEmpty(uri.Host),
        "JuiceBar:ManufacturerUri must be an HTTP(S) URL; its domain names the manufacturer in the machine id.")
    .Validate(o => o.ProductInstanceUri.Length <= 255 && o.Identity.EffectiveProductInstanceUri.Length <= 255,
        "JuiceBar:ProductInstanceUri must have at most 255 characters.")
    .Validate(o => string.IsNullOrWhiteSpace(o.MarketplaceUrl)
        || (Uri.TryCreate(o.MarketplaceUrl, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) && string.IsNullOrEmpty(uri.UserInfo)),
        "JuiceBar:MarketplaceUrl must be empty or an HTTP(S) URL without credentials.")
    .ValidateOnStart();
builder.Services.AddPleiadesHttpJsonOptions();
builder.Services.AddPleiadesForwardedHeaders();
var auth = builder.Configuration.GetSection("Config:Auth");
builder.Services.AddPleiadesJwtAuth(auth, builder.Environment);
builder.Services.AddPleiadesFeatureAuthorization(auth, Feature);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<LiveState>();
builder.Services.AddSingleton<MixerClient>();
builder.Services.AddSingleton<JuiceBarService>();
builder.Services.AddHttpClient(MixerClient.HttpClientName, (services, client) =>
{
    var settings = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<JuiceBarOptions>>().Value;
    client.BaseAddress = new Uri(new Uri(settings.BaseUrl), "/");
    client.Timeout = TimeSpan.FromSeconds(8);
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false });
builder.Services.AddSingleton<MarketplaceClient>();
builder.Services.AddHttpClient(MarketplaceClient.HttpClientName, (services, client) =>
{
    // Without an address the client is never asked: the service says that no marketplace is named.
    var settings = services.GetRequiredService<Microsoft.Extensions.Options.IOptions<JuiceBarOptions>>().Value;
    if (!string.IsNullOrWhiteSpace(settings.MarketplaceUrl))
    {
        client.BaseAddress = new Uri(new Uri(settings.MarketplaceUrl), "/");
    }

    client.Timeout = TimeSpan.FromSeconds(8);
    // Unlike the machine on the network of the stand, the marketplace may be on the internet: it is reached through
    // the proxy the container names in HTTPS_PROXY or HTTP_PROXY, where it names one.
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddHostedService<MixerLiveWorker>();

// The state goes to the broker only where one is named; REST and MCP work without it.
var mqtt = builder.Configuration.GetSection("Config:MqttDestination");
if (!string.IsNullOrWhiteSpace(mqtt["ConnectionString"]))
{
    // The last will of the binding: Connection/State = CommunicationFault, retained, as the broker publishes it when
    // the connection of the adapter breaks off.
    builder.Services.AddMqttClientHost().AddClient(mqtt, (services, client) => client.WithMachineLastWill(
        services.GetRequiredService<Microsoft.Extensions.Options.IOptions<JuiceBarOptions>>().Value.MachineId,
        services.GetRequiredService<TimeProvider>().GetUtcNow()));
    builder.Services.AddHostedService<TelemetryWorker>();
}

// Degraded, not unhealthy: the service runs and says so while the machine is switched off.
builder.Services.AddHealthChecks().AddCheck<JuiceBarHealthCheck>(Feature);
builder.Services.AddOpenApi();
builder.Services.AddPleiadesMcpServer(mcp =>
{
    mcp.Prefix = Feature;
    mcp.Title = "Read the card and the state of a juice bar and order a drink at it.";
    mcp.Domains.Add("Drinks: what the machine can mix now, with ingredients.");
    mcp.Domains.Add("Status: production state, queue, progress, pumps and low-bottle warnings.");
    mcp.Domains.Add("Orders: place one drink in the queue and follow it. A person starts the production at the machine.");
    mcp.Domains.Add("Consumption: in how many sold drinks each ingredient on a pump was, and which one is used least.");
    mcp.DiscoveryFlow.Add("Use juicebar_drinks_list to see the card and juicebar_status to see whether the machine is ready.");
    mcp.DiscoveryFlow.Add("Use juicebar_order_create only when a person asked for a drink, then juicebar_order_get to follow it.");
    mcp.WritePolicy = FeaturePolicy.Write(Feature);
}).WithPleiadesToolsFromAssembly();

var app = builder.Build();
app.UsePleiadesForwardedHeaders();
app.Use(async (context, next) =>
{
    try
    {
        await next(context).ConfigureAwait(false);
    }
    catch (Exception e) when (!context.Response.HasStarted
        && e is ArgumentException or KeyNotFoundException or InvalidOperationException or JuiceBarUnavailableException)
    {
        var status = e switch
        {
            KeyNotFoundException => StatusCodes.Status404NotFound,
            InvalidOperationException => StatusCodes.Status409Conflict,
            JuiceBarUnavailableException => StatusCodes.Status502BadGateway,
            _ => StatusCodes.Status400BadRequest,
        };
        await Results.Problem(statusCode: status, detail: e.Message).ExecuteAsync(context).ConfigureAwait(false);
    }
});
app.UsePleiadesAuth();
app.MapPleiadesLiveness();
app.MapPleiadesHealthChecks();
app.MapOpenApi().RequireFeatureRead(Feature);
app.MapPleiadesMcp().RequireFeatureRead(Feature);
app.MapGet("/drinks", (JuiceBarService juiceBar, CancellationToken ct) => juiceBar.DrinksAsync(ct)).RequireFeatureRead(Feature);
app.MapGet("/drinks/{id}", (string id, JuiceBarService juiceBar, CancellationToken ct) => juiceBar.DrinkAsync(id, ct))
    .RequireFeatureRead(Feature);
app.MapGet("/status", (JuiceBarService juiceBar, CancellationToken ct) => juiceBar.StatusAsync(ct)).RequireFeatureRead(Feature);
app.MapGet("/consumption", (int? hours, JuiceBarService juiceBar, CancellationToken ct)
    => juiceBar.ConsumptionAsync(hours ?? ConsumptionReport.DefaultHours, ct)).RequireFeatureRead(Feature);
app.MapGet("/orders/{orderNumber:int}", (int orderNumber, JuiceBarService juiceBar, CancellationToken ct) => juiceBar.OrderAsync(orderNumber, ct))
    .RequireFeatureRead(Feature);
app.MapPost("/orders", async (OrderRequest request, JuiceBarService juiceBar, CancellationToken ct) =>
{
    var order = await juiceBar.CreateOrderAsync(request.DrinkId, ct).ConfigureAwait(false);
    return Results.Created(new Uri($"/orders/{order.OrderNumber}", UriKind.Relative), order);
}).RequireFeatureWrite(Feature);
await app.RunAsync().ConfigureAwait(false);

internal sealed class JuiceBarHealthCheck(LiveState live) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        => Task.FromResult(live.Snapshot().Connected
            ? HealthCheckResult.Healthy("Listening to the juice bar.")
            : HealthCheckResult.Degraded("The juice bar does not answer."));
}

internal partial class Program;
