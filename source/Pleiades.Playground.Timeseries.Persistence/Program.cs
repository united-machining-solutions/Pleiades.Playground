using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.Common.Logging.Loki;
using Pleiades.Playground.Timeseries.Api.Client;
using Pleiades.Playground.Timeseries.Api.Client.BaseUnitValue;
using Pleiades.Playground.Timeseries.Api.Client.BooleanValue;
using Pleiades.Playground.Timeseries.Api.Client.StringValue;
using Pleiades.Playground.Timeseries.Persistence;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Mqtt.Extensions;

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

var apiConfig = builder.Configuration.GetSection("Config:TimeseriesApi")
    ?? throw new InvalidOperationException("Missing api configuration");

builder.Services.AddPleiadesDefaultJsonOptions();

builder.Services.AddTimeseriesApiService<IBaseUnitValueService, BaseUnitValueApiService>(apiConfig)
    .AddStandardResilienceHandler();
builder.Services.AddTimeseriesApiService<IStringValueService, StringValueApiService>(apiConfig)
    .AddStandardResilienceHandler();
builder.Services.AddTimeseriesApiService<IBooleanValueService, BooleanValueApiService>(apiConfig)
    .AddStandardResilienceHandler();

builder.Services.AddOptions<MqttConfig>()
    .Bind(builder.Configuration.GetSection("Config:MqttSource"))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddMqttClientHost().AddClient(builder.Configuration.GetSection("Config:MqttSource"));

builder.Services.AddHostedService<Worker>();

builder.Services.AddHealthChecks()
    // AddMqtt() reports the client's IsConnected, which is true from the CONNECT onwards - before
    // any subscription exists. This service's whole job is a subscription, so connectivity is not
    // readiness: AddMqttSubscription() reports what it can actually do.
    .AddMqtt()
    .AddMqttSubscription()
    .AddTimeseriesApi(apiConfig);

var app = builder.Build();

app.MapPleiadesHealthChecks();

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
