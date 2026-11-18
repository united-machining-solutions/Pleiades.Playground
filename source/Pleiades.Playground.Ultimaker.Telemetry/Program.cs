using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;
using Pleiades.Playground.Ultimaker.Telemetry;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOptions<TelemetryOptions>().BindConfiguration("Config")
    .Validate(o => new[] { o.ManufacturerName, o.Model, o.SerialNumber }.All(part => !string.IsNullOrWhiteSpace(part)),
        "ManufacturerName, Model and SerialNumber must each be nonempty.")
    .Validate(o => Uri.TryCreate(o.ManufacturerUri, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https"
        && !string.IsNullOrEmpty(uri.Host), "ManufacturerUri must be an HTTP(S) URL; its domain names the manufacturer in the machine id.")
    .Validate(o => o.ProductInstanceUri.Length <= 255 && o.Identity.EffectiveProductInstanceUri.Length <= 255,
        "ProductInstanceUri must have at most 255 characters.")
    .Validate(o => o.PollIntervalSecond is >= 1 and <= 10, "Poll interval must be 1..10 seconds.")
    .Validate(o => Uri.TryCreate(o.PrinterBaseUrl, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https"
        && string.IsNullOrEmpty(uri.UserInfo), "PrinterBaseUrl must be an HTTP(S) URL without credentials.")
    .ValidateOnStart();
builder.Services.TryAddSingleton(TimeProvider.System);
// The last will of the binding: Connection/State = CommunicationFault, retained, as the broker publishes it when the
// connection of the adapter breaks off.
builder.Services.AddMqttClientHost().AddClient(builder.Configuration.GetSection("Config:MqttDestination"),
    (services, client) => client.WithMachineLastWill(services.GetRequiredService<IOptions<TelemetryOptions>>().Value.MachineId,
        services.GetRequiredService<TimeProvider>().GetUtcNow()));
builder.Services.AddSingleton<TelemetryState>();
builder.Services.AddHttpClient("printer", client =>
{
    var settings = builder.Configuration.GetSection("Config").Get<TelemetryOptions>() ?? new();
    client.BaseAddress = new Uri(new Uri(settings.PrinterBaseUrl), "/api/v1/");
    client.Timeout = TimeSpan.FromSeconds(8);
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false, UseProxy = false });
builder.Services.AddHostedService<TelemetryWorker>();
builder.Services.AddHealthChecks().AddMqtt().AddCheck<PrinterTelemetryHealthCheck>("printer");
var app = builder.Build();
app.MapPleiadesHealthChecks();
app.MapHealthChecks("/health", new Microsoft.AspNetCore.Diagnostics.HealthChecks.HealthCheckOptions
{
    Predicate = registration => registration.Tags.Contains("mqtt"),
});
await app.RunAsync().ConfigureAwait(false);

internal sealed class PrinterTelemetryHealthCheck(TelemetryState state) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        => Task.FromResult(state.IsFresh ? HealthCheckResult.Healthy("Printer observations are current.")
            : HealthCheckResult.Unhealthy("Printer observations are unavailable or stale."));
}
