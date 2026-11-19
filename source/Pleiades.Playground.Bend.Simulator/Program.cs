using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Bend.Protocol.Transport;
using Pleiades.Playground.Bend.Simulator;
using Pleiades.Playground.Bend.Simulator.Endpoints;
using Pleiades.Playground.Bend.Simulator.Machine;
using Pleiades.Playground.Bend.Simulator.Processing;
using Pleiades.Playground.Bend.Simulator.ProductionPlan;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.HealthChecks.AspNetCore;

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
builder.Services.AddSingleton(Random.Shared);
builder.Services.AddSingleton(sp =>
{
    var config = sp.GetRequiredService<IOptions<Config>>().Value;
    return new RciTelegramWriter(
        new RciChannelOptions { Directory = config.ExchangeDirectory, MachineFilePrefix = config.MachineFilePrefix },
        sp.GetRequiredService<TimeProvider>());
});
builder.Services.AddSingleton<SimulatorRuntime>();
builder.Services.AddSingleton<TelegramLog>();
builder.Services.AddSingleton<MachineBusyState>();
builder.Services.AddSingleton<MachineDataService>();
builder.Services.AddSingleton<DummyProductionDataFactory>();
builder.Services.AddSingleton<ProductionPlanService>();
builder.Services.AddSingleton<AutomaticProcessingService>();

// The state is loaded before the web page is served.
builder.Services.AddHostedService<StatePersistence>();

builder.Services.AddHealthChecks()
    .AddCheck<ExchangeDirectoryHealthCheck>("exchange-directory");

builder.Services.AddProblemDetails();
builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

var app = builder.Build();

// The telegram log listens from the start, not only once the web page first asks for it.
app.Services.GetRequiredService<TelegramLog>();
app.Lifetime.ApplicationStopping.Register(() => app.Services.GetRequiredService<AutomaticProcessingService>().CancelProcessing());

app.UseExceptionHandler();
app.UseDefaultFiles();
// The browser asks again on every load (ETag), so a new image never shows a page of the one before.
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "no-cache",
});
app.MapPleiadesHealthEndpoints();
app.MapSimulatorEndpoints();

var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogConfiguration(app.Services.GetRequiredService<IOptions<Config>>().Value);

await app.RunAsync().ConfigureAwait(false);
