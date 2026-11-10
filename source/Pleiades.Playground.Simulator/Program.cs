using Microsoft.AspNetCore.Builder;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Events.Generators.NotificationEvent;
using Pleiades.Playground.Timeseries.Generators.BaseUnitValue;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Timeseries.Generators.BooleanValue;
using Pleiades.Playground.Timeseries.Generators.StringValue;
using Pleiades.Playground.Simulator;
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
builder.Services.AddMqttClientHost().AddClient(builder.Configuration.GetSection("Config:MqttDestination"));

// One simulator instance is one machine: the serial number is the machine id of every topic.
var serialNumber = builder.Configuration["Config:SerialNumber"]
    ?? throw new InvalidOperationException("Config:SerialNumber is required.");
var baseTopic = $"machines/{serialNumber}";

builder.Services.AddOptions<BaseUnitValueGeneratorConfig>()
    .Bind(builder.Configuration.GetSection("Config:BaseUnitValueGeneratorConfig"))
    .PostConfigure(c => c.BaseTopic = baseTopic)
    .ValidateDataAnnotations();
builder.Services.AddSingleton<IBaseUnitValueGenerator, BaseUnitValueGenerator>();

builder.Services.AddOptions<StringValueGeneratorConfig>()
    .Bind(builder.Configuration.GetSection("Config:StringValueGeneratorConfig"))
    .PostConfigure(c => c.BaseTopic = baseTopic)
    .ValidateDataAnnotations();
builder.Services.AddSingleton<IStringValueGenerator, StringValueGenerator>();

builder.Services.AddOptions<BooleanValueGeneratorConfig>()
    .Bind(builder.Configuration.GetSection("Config:BooleanValueGeneratorConfig"))
    .PostConfigure(c => c.BaseTopic = baseTopic)
    .ValidateDataAnnotations();
builder.Services.AddSingleton<IBooleanValueGenerator, BooleanValueGenerator>();

builder.Services.AddOptions<NotificationEventGeneratorConfig>()
    .Bind(builder.Configuration.GetSection("Config:NotificationEventGeneratorConfig"))
    .PostConfigure(c => c.MId = serialNumber)
    .ValidateDataAnnotations();
builder.Services.AddSingleton<INotificationEventGenerator, NotificationEventGenerator>();

builder.Services.AddPleiadesDefaultJsonOptions();

builder.Services.AddHostedService<Worker>();

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
