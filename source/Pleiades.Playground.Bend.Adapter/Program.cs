using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Bend.Adapter;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Bend.Protocol.Transport;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;

var builder = WebApplication.CreateSlimBuilder(args);

builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
    .ValidateDataAnnotations()
    .Validate(config => string.IsNullOrWhiteSpace(config.MachineTimeZone) || TimeZoneInfo.TryFindSystemTimeZoneById(config.MachineTimeZone, out _),
        "Config:MachineTimeZone is no known time zone.")
    .ValidateOnStart();

var serviceInfo = typeof(Program).Assembly
    .CreateServiceInfo(builder.Environment.EnvironmentName)
    .UseConfiguration(builder.Configuration);
builder.UsePleiadesLogging(serviceInfo);

builder.Services.AddOptions<MqttConfig>()
    .Bind(builder.Configuration.GetSection("Config:MqttDestination"))
    .ValidateDataAnnotations()
    .ValidateOnStart();
// The last will of the binding: Connection/State = CommunicationFault, retained, as the broker publishes it when the
// connection of the adapter breaks off.
builder.Services.AddMqttClientHost().AddClient(builder.Configuration.GetSection("Config:MqttDestination"),
    (services, client) => client.WithMachineLastWill(
        services.GetRequiredService<IOptions<Config>>().Value.Identity.MachineId,
        services.GetRequiredService<TimeProvider>().GetUtcNow()));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IOptions<Config>>().Value.Identity);
builder.Services.AddSingleton(sp =>
{
    var zone = sp.GetRequiredService<IOptions<Config>>().Value.MachineTimeZone;
    return new RciTelegramParser(string.IsNullOrWhiteSpace(zone) ? TimeZoneInfo.Local : TimeZoneInfo.FindSystemTimeZoneById(zone));
});
builder.Services.AddSingleton(sp =>
{
    var config = sp.GetRequiredService<IOptions<Config>>().Value;
    return new RciExchangeDirectory(config.ExchangeDirectory, config.MachineFilePrefix);
});
builder.Services.AddSingleton(sp => new BendTranslator(
    sp.GetRequiredService<MachineIdentity>(),
    sp.GetRequiredService<TimeProvider>()));
builder.Services.AddSingleton<IPublisher, MqttPublisher>();
builder.Services.AddHostedService<AdapterWorker>();

builder.Services.AddHealthChecks()
    .AddMqtt();

var app = builder.Build();

// /healthcheck fails while the adapter is not connected to the broker.
app.MapPleiadesHealthEndpoints();

var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogConfiguration(
    app.Services.GetRequiredService<IOptions<Config>>().Value,
    redactor => redactor
        .Redact(c => c.MqttDestination.ConnectionString, BuiltInRedactors.MqttUri)
        .Redact(c => c.MqttDestination.User, BuiltInRedactors.MaskAll)
        .Redact(c => c.MqttDestination.Password, BuiltInRedactors.MaskAll));

await app.RunAsync().ConfigureAwait(false);
