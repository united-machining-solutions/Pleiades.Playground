using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Simulator.ProductionPlan;

namespace Pleiades.Playground.Bend.Simulator.Machine;

/// <summary>
/// Keeps the production plan in a file, so that a restarted container goes on where it stopped. A new machine starts
/// with a few demo packages.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed partial class StatePersistence(
    SimulatorRuntime runtime,
    DummyProductionDataFactory dummyData,
    IOptions<Config> config,
    ILogger<StatePersistence> logger) : BackgroundService
{
    private static readonly TimeSpan SaveDelay = TimeSpan.FromSeconds(2);
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private string Path => config.Value.StatePath;

    public override Task StartAsync(CancellationToken cancellationToken)
    {
        // Load before the web page is served: the plan is there from the first request on.
        if (!Load() && config.Value.SeedDemoOrders)
        {
            runtime.ProductionPackages.AddRange(dummyData.CreateDataset(new GenerateDatasetRequest(3, 3, 3, 8, "DEMO")));
            runtime.NotifyChanged();
        }

        return base.StartAsync(cancellationToken);
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken).ConfigureAwait(false);
        await SaveAsync(CancellationToken.None).ConfigureAwait(false);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (string.IsNullOrWhiteSpace(Path))
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await runtime.WaitForChangeAsync(stoppingToken).ConfigureAwait(false);
                await Task.Delay(SaveDelay, stoppingToken).ConfigureAwait(false);
                await SaveAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                LogSaveFailed(exception, Path);
            }
        }
    }

    /// <returns>Whether a state was there to load.</returns>
    internal bool Load()
    {
        if (string.IsNullOrWhiteSpace(Path) || !File.Exists(Path))
        {
            return false;
        }

        try
        {
            var packages = JsonSerializer.Deserialize<List<ProductionPackage>>(File.ReadAllText(Path), JsonOptions) ?? [];
            runtime.ProductionPackages.AddRange(packages);
            LogLoaded(packages.Count, Path);
            return true;
        }
        catch (Exception exception) when (exception is IOException or JsonException)
        {
            LogLoadFailed(exception, Path);
            return false;
        }
    }

    internal async Task SaveAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(Path))
        {
            return;
        }

        var json = JsonSerializer.Serialize(runtime.GetProductionPackagesSnapshot(), JsonOptions);
        var directory = System.IO.Path.GetDirectoryName(System.IO.Path.GetFullPath(Path));
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var partial = Path + ".partial";
        await File.WriteAllTextAsync(partial, json, cancellationToken).ConfigureAwait(false);
        File.Move(partial, Path, overwrite: true);
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Loaded {Count} production packages from {Path}")]
    private partial void LogLoaded(int count, string path);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The state at {Path} could not be read; the plan starts empty")]
    private partial void LogLoadFailed(Exception exception, string path);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The state could not be saved to {Path}")]
    private partial void LogSaveFailed(Exception exception, string path);
}
