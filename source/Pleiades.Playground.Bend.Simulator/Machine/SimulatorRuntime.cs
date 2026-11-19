using Microsoft.Extensions.Options;
using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Protocol.Telegrams;

namespace Pleiades.Playground.Bend.Simulator.Machine;

/// <summary>
/// The one simulated machine of this instance: its identity, its production plan and the writer of its telegrams.
/// The simulator only sends (RCI interface description, chapter 4.2); commands of the host are not read.
/// <see cref="StatePersistence"/> keeps the production plan across restarts.
/// </summary>
internal sealed partial class SimulatorRuntime
{
    private readonly Lock _syncRoot = new();
    private TaskCompletionSource _changed = new(TaskCreationOptions.RunContinuationsAsynchronously);

    public SimulatorRuntime(IOptions<Config> config, RciTelegramWriter telegrams, ILogger<SimulatorRuntime> logger)
    {
        ArgumentNullException.ThrowIfNull(config);
        ArgumentNullException.ThrowIfNull(logger);
        Telegrams = telegrams ?? throw new ArgumentNullException(nameof(telegrams));
        Config = config.Value;
        Identity = MachineIdentity.From(Config);

        try
        {
            Directory.CreateDirectory(Config.ExchangeDirectory);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            LogExchangeDirectoryNotCreated(logger, exception, Config.ExchangeDirectory);
        }

        LogSimulating(logger, Identity.ProductInstanceUri, Config.ExchangeDirectory);
    }

    public Config Config { get; }

    /// <summary>Read only: it comes from the configuration, which the adapter of the machine shares.</summary>
    public MachineIdentity Identity { get; }

    public RciTelegramWriter Telegrams { get; }

    /// <summary>The production plan. Changed only while the machine is not busy, or by the one running job.</summary>
    public List<ProductionPackage> ProductionPackages { get; } = [];

    /// <summary>A copy of the production plan, safe to enumerate while it changes.</summary>
    public IReadOnlyList<ProductionPackage> GetProductionPackagesSnapshot()
    {
        lock (_syncRoot)
        {
            return ProductionPackages.ToArray();
        }
    }

    /// <summary>Tells those who wait that the production plan changed.</summary>
    public void NotifyChanged()
    {
        Interlocked.Exchange(ref _changed, new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)).TrySetResult();
    }

    /// <summary>Waits until the production plan changes.</summary>
    public Task WaitForChangeAsync(CancellationToken cancellationToken) => Volatile.Read(ref _changed).Task.WaitAsync(cancellationToken);

    [LoggerMessage(Level = LogLevel.Information, Message = "Simulating machine {ProductInstanceUri}, telegrams are written to {ExchangeDirectory}")]
    private static partial void LogSimulating(ILogger logger, string productInstanceUri, string exchangeDirectory);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The exchange folder {ExchangeDirectory} could not be created")]
    private static partial void LogExchangeDirectoryNotCreated(ILogger logger, Exception exception, string exchangeDirectory);
}
