using Microsoft.Extensions.Diagnostics.HealthChecks;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Ultimaker.Telemetry;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOptions<TelemetryOptions>().BindConfiguration("Config")
    .Validate(o => new[] { o.Manufacturer, o.Model, o.SerialNumber }.All(part => !string.IsNullOrWhiteSpace(part)
            && !part.Any(c => char.IsWhiteSpace(c) || "/+#".Contains(c))),
        "Manufacturer, Model and SerialNumber must each be nonempty and fit in one MQTT topic segment.")
    .Validate(o => o.PollIntervalSecond is >= 1 and <= 10, "Poll interval must be 1..10 seconds.")
    .Validate(o => Uri.TryCreate(o.PrinterBaseUrl, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https"
        && string.IsNullOrEmpty(uri.UserInfo), "PrinterBaseUrl must be an HTTP(S) URL without credentials.")
    .ValidateOnStart();
builder.Services.AddMqttClientHost().AddClient(builder.Configuration.GetSection("Config:MqttDestination"));
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
