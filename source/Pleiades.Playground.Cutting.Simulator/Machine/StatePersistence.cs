using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>
/// Keeps the production plan, the NC archive and the stock in a file, so that a restarted container goes on
/// where it stopped. A new machine, or one of another type, starts with the demo orders.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed partial class StatePersistence(
    CuttingMachine machine,
    IOptions<Config> config,
    ILogger<StatePersistence> logger) : BackgroundService
{
    private static readonly TimeSpan SaveDelay = TimeSpan.FromSeconds(2);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() },
    };

    private string Path => config.Value.StatePath;

    public override Task StartAsync(CancellationToken cancellationToken)
    {
        // Load before the other services start: they are registered after this one.
        if (!Load() && config.Value.SeedDemoOrders)
        {
            foreach (var order in machine.Variant.DemoOrders())
            {
                machine.InsertOrder(order, 0);
            }
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

        var last = string.Empty;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await machine.WaitForChangeAsync(Timeout.InfiniteTimeSpan, stoppingToken).ConfigureAwait(false);
                await Task.Delay(SaveDelay, stoppingToken).ConfigureAwait(false);
                last = await SaveAsync(stoppingToken, last).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    private bool Load()
    {
        if (string.IsNullOrWhiteSpace(Path) || !File.Exists(Path))
        {
            return false;
        }

        try
        {
            var state = JsonSerializer.Deserialize<PersistedState>(File.ReadAllText(Path), JsonOptions);
            if (state is null || state.Type != machine.Type)
            {
                LogOtherType(Path);
                return false;
            }

            machine.Import(state);
            LogLoaded(state.Orders.Count, Path);
            return true;
        }
        catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException)
        {
            LogLoadFailed(ex, Path);
            return false;
        }
    }

    /// <summary>Writes the state when it differs from <paramref name="last"/>; returns what it wrote.</summary>
    private async Task<string> SaveAsync(CancellationToken cancellationToken, string last = "")
    {
        if (string.IsNullOrWhiteSpace(Path))
        {
            return last;
        }

        var json = JsonSerializer.Serialize(machine.Export(), JsonOptions);
        if (json == last)
        {
            return last;
        }

        try
        {
            var directory = System.IO.Path.GetDirectoryName(Path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            // Write beside and move, so that a crash leaves the old file or the new one, never half of one.
            var temporary = Path + ".tmp";
            await File.WriteAllTextAsync(temporary, json, cancellationToken).ConfigureAwait(false);
            File.Move(temporary, Path, overwrite: true);
            return json;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            LogSaveFailed(ex, Path);
            return last;
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Loaded {Count} orders from {Path}.")]
    private partial void LogLoaded(int count, string path);

    [LoggerMessage(Level = LogLevel.Information, Message = "{Path} belongs to another machine type; the machine starts new.")]
    private partial void LogOtherType(string path);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not read the state from {Path}; the machine starts new.")]
    private partial void LogLoadFailed(Exception exception, string path);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not save the state to {Path}.")]
    private partial void LogSaveFailed(Exception exception, string path);
}
