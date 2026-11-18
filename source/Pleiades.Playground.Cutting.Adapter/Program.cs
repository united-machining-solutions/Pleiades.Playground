using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Mqtt.Extensions.Machines;
using Pleiades.Playground.Cutting.Adapter;
using Pleiades.Playground.Cutting.Protocol.Transport;

var builder = WebApplication.CreateSlimBuilder(args);

builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
    .ValidateDataAnnotations()
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
    var config = sp.GetRequiredService<IOptions<Config>>().Value;
    return new CuttingFileChannel(
        new CuttingChannelOptions
        {
            Directory = config.ExchangeDirectory,
            Role = CuttingRole.Host,
            MachineFileName = config.MachineFileName,
            HostFileName = config.HostFileName,
            LockTimeout = config.LockTimeout,
        },
        sp.GetRequiredService<ILogger<CuttingFileChannel>>());
});
builder.Services.AddSingleton(sp => new CuttingHostSession(
    sp.GetRequiredService<CuttingFileChannel>(),
    sp.GetRequiredService<IOptions<Config>>().Value.PollInterval,
    sp.GetRequiredService<ILogger<CuttingHostSession>>()));
builder.Services.AddSingleton(sp =>
{
    var config = sp.GetRequiredService<IOptions<Config>>().Value;
    var zone = config.MachineTimeZone;
    return new CuttingTranslator(
        config.Identity,
        string.IsNullOrWhiteSpace(zone) ? TimeZoneInfo.Local : TimeZoneInfo.FindSystemTimeZoneById(zone),
        sp.GetRequiredService<TimeProvider>(),
        config.StateHold,
        sp.GetRequiredService<ILogger<CuttingTranslator>>());
});
builder.Services.AddSingleton<IPublisher, MqttPublisher>();
builder.Services.AddHostedService<AdapterWorker>();

builder.Services.AddHealthChecks()
    .AddMqtt();

var app = builder.Build();

app.MapPleiadesHealthEndpoints();

var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogConfiguration(
    app.Services.GetRequiredService<IOptions<Config>>().Value,
    redactor => redactor
        .Redact(c => c.MqttDestination.ConnectionString, BuiltInRedactors.MqttUri)
        .Redact(c => c.MqttDestination.User, BuiltInRedactors.MaskAll)
        .Redact(c => c.MqttDestination.Password, BuiltInRedactors.MaskAll));

await app.RunAsync().ConfigureAwait(false);
