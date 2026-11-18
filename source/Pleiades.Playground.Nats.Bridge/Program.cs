using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Options;
using NATS.Client.Core;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.Common.Logging.Loki;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Nats.Bridge;

var builder = WebApplication.CreateSlimBuilder(args);

// 1. Bind Configuration
builder.Services.AddSingleton<IValidateOptions<Config>, ConfigValidator>();
builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
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
builder.Services.AddMqttClientHost().AddClient(builder.Configuration.GetSection("Config:MqttSource"));

// One connection for the life of the service; it reconnects by itself.
builder.Services.AddSingleton<INatsConnection>(sp => new NatsConnection(NatsOptionsFactory.Create(
    sp.GetRequiredService<IOptions<Config>>().Value.Nats, sp.GetRequiredService<ILoggerFactory>())));
builder.Services.AddSingleton<ICloudEventPublisher, NatsPublisher>();
builder.Services.AddSingleton<PublishOutcome>();

builder.Services.AddHealthChecks()
    // The bridge does its work through a subscription and a connection to NATS: both must stand.
    .AddMqtt()
    .AddMqttSubscription()
    .AddCheck<NatsHealthCheck>("nats");

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
        .Redact(c => c.Nats.User, BuiltInRedactors.MaskAll)
        .Redact(c => c.Nats.Password, BuiltInRedactors.MaskAll)
        .Redact(c => c.Nats.Token, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Username, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Password, BuiltInRedactors.MaskAll));

await app.RunAsync().ConfigureAwait(false);
