using Microsoft.Extensions.Diagnostics.HealthChecks;
using Pleiades.Playground.Common.AspNetCore;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.JuiceBar.Api;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Mqtt.Extensions;

const string Feature = "juicebar";

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOptions<JuiceBarOptions>().BindConfiguration("JuiceBar")
    .Validate(o => Uri.TryCreate(o.BaseUrl, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps) && string.IsNullOrEmpty(uri.UserInfo),
        "JuiceBar:BaseUrl must be an HTTP(S) URL without credentials.")
    .Validate(o => o.MaximumQueueLength is >= 1 and <= 20, "JuiceBar:MaximumQueueLength must be 1..20.")
    .Validate(o => new[] { o.Manufacturer, o.Model, o.SerialNumber }.All(part => !string.IsNullOrWhiteSpace(part)
            && !part.Any(c => char.IsWhiteSpace(c) || "/+#_".Contains(c, StringComparison.Ordinal))),
        "JuiceBar:Manufacturer, JuiceBar:Model and JuiceBar:SerialNumber must each be nonempty, fit in one MQTT topic segment and hold no '_', which separates them in the machine id.")
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
builder.Services.AddHostedService<MixerLiveWorker>();

// The state goes to the broker only where one is named; REST and MCP work without it.
var mqtt = builder.Configuration.GetSection("Config:MqttDestination");
if (!string.IsNullOrWhiteSpace(mqtt["ConnectionString"]))
{
    builder.Services.AddMqttClientHost().AddClient(mqtt);
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
