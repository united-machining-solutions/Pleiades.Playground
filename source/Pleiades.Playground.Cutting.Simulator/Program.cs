using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Transport;
using Pleiades.Playground.Cutting.Simulator;
using Pleiades.Playground.Cutting.Simulator.Components;
using Pleiades.Playground.Cutting.Simulator.Machine;
using Pleiades.Playground.Cutting.Simulator.Machine.Variants;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
    .ValidateDataAnnotations()
    .ValidateOnStart();

var serviceInfo = typeof(Program).Assembly
    .CreateServiceInfo(builder.Environment.EnvironmentName)
    .UseConfiguration(builder.Configuration);
builder.UsePleiadesLogging(serviceInfo);

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IMachineVariant>(sp => sp.GetRequiredService<IOptions<Config>>().Value.MachineType switch
{
    CuttingMachineType.Tube => new TubeVariant(),
    CuttingMachineType.Punch => new PunchVariant(),
    _ => new LaserVariant(),
});
builder.Services.AddSingleton(sp =>
{
    var config = sp.GetRequiredService<IOptions<Config>>().Value;
    return new CuttingFileChannel(
        new CuttingChannelOptions
        {
            Directory = config.ExchangeDirectory,
            Role = CuttingRole.Machine,
            MachineFileName = config.MachineFileName,
            HostFileName = config.HostFileName,
            LockTimeout = config.LockTimeout,
        },
        sp.GetRequiredService<ILogger<CuttingFileChannel>>());
});
builder.Services.AddSingleton<CuttingMachine>();
builder.Services.AddSingleton<TelegramLog>();
builder.Services.AddSingleton<CuttingLink>();
builder.Services.AddSingleton<MachineActions>();
builder.Services.AddSingleton<CommandDispatcher>();

// The order matters: the state is loaded before the machine switches on and the runner starts.
builder.Services.AddHostedService<StatePersistence>();
builder.Services.AddHostedService<CuttingLinkService>();
builder.Services.AddHostedService<ProductionRunner>();

builder.Services.AddHealthChecks()
    .AddCheck<ExchangeDirectoryHealthCheck>("exchange-directory");

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

var app = builder.Build();

app.UseAntiforgery();
app.MapStaticAssets();
app.MapPleiadesHealthEndpoints();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogConfiguration(app.Services.GetRequiredService<IOptions<Config>>().Value);

await app.RunAsync().ConfigureAwait(false);
