using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;
using Polly;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.Common.Logging.Loki;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Common.RestApi;
using Pleiades.Playground.Events.Api.Client;
using Pleiades.Playground.Events.Api.Client.NotificationEvents;
using Pleiades.Playground.Events.Persistence;
using Pleiades.Playground.Mqtt.Extensions;

var builder = WebApplication.CreateSlimBuilder(args);

// 1. Bind Configuration
builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddOptions<RestApiConfig>()
    .BindConfiguration("Config:EventsApi")
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddOptions<MqttConfig>()
    .BindConfiguration("Config:MqttSource")
    .ValidateDataAnnotations()
    .ValidateOnStart();

// 2. Create ServiceInfo
var serviceInfo = typeof(Program).Assembly
    .CreateServiceInfo(builder.Environment.EnvironmentName)
    .UseConfiguration(builder.Configuration);

// 3. Configure Logging
builder.UsePleiadesLogging(serviceInfo, (loggerConfig, config) =>
{
    loggerConfig.WriteToLoki(config, serviceInfo, "Config:Loki");
});

// 4. Register Services
var apiConfig = builder.Configuration.GetSection("Config:EventsApi") ?? throw new InvalidOperationException("Missing or invalid configuration.");

builder.Services.AddMqttClientHost().AddClient(builder.Configuration.GetSection("Config:MqttSource"));

builder.Services.AddEventsApiService<INotificationEventService, NotificationEventApiService>(apiConfig)
    .AddStandardResilienceHandler(ConfigureEventClientResilience);

builder.Services.AddPleiadesDefaultJsonOptions();

builder.Services.AddHealthChecks()
    // AddMqtt() reports the client's IsConnected, which is true from the CONNECT onwards - before any
    // subscription exists. This service's whole job is a subscription, so connectivity is not
    // readiness: AddMqttSubscription() reports what it can actually do.
    .AddMqtt()
    .AddMqttSubscription()
    .AddEventsApi(apiConfig);

builder.Services.AddHostedService<Worker>();

var app = builder.Build();

app.MapPleiadesHealthChecks();

// Log sanitized configuration at startup
var logger = app.Services.GetRequiredService<ILogger<Program>>();
var config = app.Services.GetRequiredService<IOptions<Config>>();

logger.LogConfiguration(
    config.Value,
    redactor => redactor
        .Redact(c => c.MqttSource.ConnectionString, BuiltInRedactors.MqttUri)
        .Redact(c => c.MqttSource.User, BuiltInRedactors.MaskAll)
        .Redact(c => c.MqttSource.Password, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Username, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Password, BuiltInRedactors.MaskAll));

await app.RunAsync().ConfigureAwait(false);

// Tunes the standard resilience pipeline for the event API clients: durable retries with
// exponential backoff and jitter, bounded per-attempt and total request timeouts.
static void ConfigureEventClientResilience(HttpStandardResilienceOptions o)
{
    o.Retry.MaxRetryAttempts = 5;
    o.Retry.Delay = TimeSpan.FromSeconds(2);
    o.Retry.BackoffType = DelayBackoffType.Exponential;
    o.Retry.UseJitter = true;
    o.AttemptTimeout.Timeout = TimeSpan.FromSeconds(10);
    o.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(120);
}
