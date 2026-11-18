using Microsoft.AspNetCore.Builder;
using MQTTnet;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Simulator;
using Pleiades.Playground.Simulator.Spec;
using Pleiades.Playground.Mqtt.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.Common.Logging.Loki;
using Pleiades.Playground.Common.Logging.Models;

var builder = WebApplication.CreateSlimBuilder(args);

// Bind and validate configuration
builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
    .ValidateDataAnnotations()
    .ValidateOnStart();

// Service Info
var serviceInfo = typeof(Program).Assembly
    .CreateServiceInfo(builder.Environment.EnvironmentName)
    .UseConfiguration(builder.Configuration);

// Configure Logging
builder.UsePleiadesLogging(serviceInfo, (loggerConfig, config) =>
{
    loggerConfig.WriteToLoki(config, serviceInfo, "Config:Loki");
});

builder.Services.AddOptions<MqttConfig>()
    .Bind(builder.Configuration.GetSection("Config:MqttDestination"))
    .ValidateDataAnnotations()
    .ValidateOnStart();

// One simulator instance is one machine: a virtual machine that publishes after the data model below
// machines/{MachineId}/. Its MQTT client is the one the health check watches; the service starts it with the last
// will of the machine and stops it.
builder.Services.AddSingleton<IManagedMqttClient>(provider =>
    new MqttClientFactory().CreateManagedMqttClientWithLogger(provider.GetRequiredService<ILoggerFactory>()));

builder.Services.AddPleiadesDefaultJsonOptions();

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddHostedService<VirtualMachineService>();

builder.Services.AddHealthChecks()
    .AddMqtt();

var app = builder.Build();

app.MapPleiadesHealthChecks();

var logger = app.Services.GetRequiredService<ILogger<Program>>();
var config = app.Services.GetRequiredService<IOptions<Config>>();

logger.LogConfiguration(
    config.Value,
    redactor => redactor
        .Redact(c => c.MqttDestination.ConnectionString, BuiltInRedactors.MqttUri)
        .Redact(c => c.MqttDestination.User, BuiltInRedactors.MaskAll)
        .Redact(c => c.MqttDestination.Password, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Username, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Password, BuiltInRedactors.MaskAll));

await app.RunAsync().ConfigureAwait(false);
