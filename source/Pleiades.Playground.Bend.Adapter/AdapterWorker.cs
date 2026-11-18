using System.Diagnostics.CodeAnalysis;
using System.Xml;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Bend.Protocol.Transport;

namespace Pleiades.Playground.Bend.Adapter;

/// <summary>
/// The host side of one bending machine:
/// <list type="bullet">
/// <item>At the start, the connect sequence of the binding (<c>Initializing</c>, manifest, identification), then the
/// files that are there already, keeping only the newest value of each path and no event, so a restart does not
/// repeat the history. Then <c>Running</c>, or <c>CommunicationFault</c> when the machine last said it is offline.</item>
/// <item>Every poll interval read the files that are new or written again, translate and publish them. The operating
/// state offline (3) is <c>CommunicationFault</c>; any other one <c>Running</c> again.</item>
/// <item>Every heartbeat interval <c>Connection/Heartbeat</c>, the sign of life of the adapter.</item>
/// <item>On stop, <c>Shutdown</c>.</item>
/// </list>
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed partial class AdapterWorker(
    IOptions<Config> options,
    RciTelegramParser parser,
    RciExchangeDirectory directory,
    BendTranslator translator,
    IPublisher publisher,
    TimeProvider time,
    ILogger<AdapterWorker> logger) : BackgroundService
{
    /// <summary>A file this young may still be written to by the machine.</summary>
    private static readonly TimeSpan SettleTime = TimeSpan.FromMilliseconds(300);

    private readonly SemaphoreSlim _gate = new(1, 1);

    private Config Config => options.Value;

    private DateTime Now => time.GetUtcNow().UtcDateTime;

    public override void Dispose()
    {
        _gate.Dispose();
        base.Dispose();
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        LogStarted(Config.SerialNumber, Config.ExchangeDirectory, Config.MachineFilePrefix);
        try
        {
            await StartUpAsync().ConfigureAwait(false);
            await Task.WhenAll(
                EveryAsync(Config.PollInterval, ReadNewFilesAsync, stoppingToken),
                EveryAsync(Config.HeartbeatInterval, HeartbeatAsync, stoppingToken)).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // The service stops.
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken).ConfigureAwait(false);
        await PublishAsync(p => p.ShutdownAsync()).ConfigureAwait(false);
    }

    /// <summary>
    /// Begins the connect sequence and publishes the newest values of the files that are there already, then what
    /// stands now.
    /// </summary>
    internal async Task StartUpAsync()
    {
        await PublishAsync(p => p.StartAsync()).ConfigureAwait(false);
        await HeartbeatAsync().ConfigureAwait(false);

        var newest = new Dictionary<string, Publication>(StringComparer.Ordinal);
        var count = 0;
        foreach (var file in directory.FindNew(Now - SettleTime))
        {
            foreach (var observation in Read(file))
            {
                foreach (var publication in translator.Translate(observation, withEvents: false).OfType<ValuePublication>())
                {
                    newest[publication.Path] = publication;
                }
            }

            count++;
        }

        LogExisting(count, newest.Count);
        await DeliverAsync([.. newest.Values, .. translator.Current()]).ConfigureAwait(false);
    }

    internal async Task ReadNewFilesAsync()
    {
        foreach (var file in directory.FindNew(Now - SettleTime))
        {
            foreach (var observation in Read(file))
            {
                await DeliverAsync(translator.Translate(observation)).ConfigureAwait(false);
            }
        }
    }

    internal Task HeartbeatAsync() => PublishAsync(p => p.HeartbeatAsync());

    /// <summary>
    /// A machine that says it is offline is not reached: its last values stand, with <c>CommunicationFault</c>. Any
    /// other word of it reaches it again.
    /// </summary>
    private Task DeliverAsync(IReadOnlyList<Publication> publications) => PublishAsync(async p =>
    {
        if (translator.Offline)
        {
            await p.SaidAsync(publications).ConfigureAwait(false);
            await p.LostAsync().ConfigureAwait(false);
        }
        else
        {
            await p.ReachedAsync(publications).ConfigureAwait(false);
        }
    });

    /// <summary>Publishes under one lock, so that values keep the order the machine sent them in.</summary>
    private async Task PublishAsync(Func<IPublisher, Task> publish)
    {
        // Not cancelled by stopping: StopAsync still publishes Shutdown.
        await _gate.WaitAsync(CancellationToken.None).ConfigureAwait(false);
        try
        {
            await publish(publisher).ConfigureAwait(false);
        }
        finally
        {
            _gate.Release();
        }
    }

    /// <summary>
    /// Reads one file and marks it read; a file that is not complete yet is read at the next look. A file the adapter
    /// may not read is read again at the next look too, and the files after it are read meanwhile.
    /// </summary>
    private IReadOnlyList<RciObservation> Read(MessageFile file)
    {
        var name = Path.GetFileName(file.Path);
        try
        {
            var observations = parser.Parse(File.ReadAllText(file.Path), file.WrittenAtUtc);
            directory.MarkRead(file);
            LogFileRead(name, observations.Count);
            return observations;
        }
        catch (Exception exception) when (exception is XmlException or IOException)
        {
            LogFileIncomplete(name, exception.Message);
            return [];
        }
        catch (UnauthorizedAccessException exception)
        {
            LogFileNotReadable(name, exception.Message);
            return [];
        }
    }

    private async Task EveryAsync(TimeSpan interval, Func<Task> action, CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(interval, time);
        while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false))
        {
            try
            {
                await action().ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                LogFailed(exception);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Adapter for machine {SerialNumber} reads {Directory}, files {MachineFilePrefix}<n>.xml")]
    private partial void LogStarted(string serialNumber, string directory, string machineFilePrefix);

    [LoggerMessage(Level = LogLevel.Information, Message = "Read {FileCount} files that were there at the start; published the newest of {PathCount} paths")]
    private partial void LogExisting(int fileCount, int pathCount);

    [LoggerMessage(Level = LogLevel.Information, Message = "Read {File}: {ObservationCount} observations")]
    private partial void LogFileRead(string file, int observationCount);

    [LoggerMessage(Level = LogLevel.Debug, Message = "{File} is not complete yet, read again at the next look: {Reason}")]
    private partial void LogFileIncomplete(string file, string reason);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{File} may not be read, read again at the next look: {Reason}")]
    private partial void LogFileNotReadable(string file, string reason);

    [LoggerMessage(Level = LogLevel.Error, Message = "A step of the adapter failed; it is tried again at the next tick")]
    private partial void LogFailed(Exception exception);
}
