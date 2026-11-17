using System.Diagnostics.CodeAnalysis;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Cutting.Protocol.Transport;

namespace Pleiades.Playground.Cutting.Adapter;

/// <summary>
/// Keeps the connection to the machine as §2.5 describes it and publishes what the machine says.
/// </summary>
/// <remarks>
/// <list type="number">
/// <item>Send <c>SRC9CONN</c>. Without a reply, wait for <c>$$src9_server_connect$$</c> or the next try.</item>
/// <item>Connected: publish <c>Connection/State</c> and ask <c>MACHINFO</c>, which makes the machine send its
/// feed rate (§6.4).</item>
/// <item>Every heartbeat interval ask <c>SYSTTIME</c>. The protocol has no heartbeat of its own; each reply is one.
/// After a few unanswered requests the machine counts as disconnected.</item>
/// <item>On stop, <c>SRC9DISC</c>.</item>
/// </list>
/// </remarks>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed partial class AdapterWorker(
    CuttingFileChannel channel,
    CuttingHostSession session,
    CuttingTranslator translator,
    IPublisher publisher,
    IOptions<Config> options,
    ILogger<AdapterWorker> logger) : BackgroundService
{
    private const string HostVersion = "2.1.0";

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly SemaphoreSlim _machineAnnounced = new(0);
    private volatile bool _connected;
    private int _missed;
    private long _heartbeat;
    private bool _wrongNumberLogged;
    private CancellationToken _stopping;

    private Config Config => options.Value;

    /// <summary>Whether the machine answers.</summary>
    public bool Connected => _connected;

    public override void Dispose()
    {
        _gate.Dispose();
        _machineAnnounced.Dispose();
        base.Dispose();
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken).ConfigureAwait(false);
        if (!_connected)
        {
            return;
        }

        // The reading loop has stopped, so the reply is not awaited.
        _connected = false;
        try
        {
            await channel.SendAsync([CuttingTelegram.Request(CuttingCommands.Disconnect, 0)], cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or OperationCanceledException)
        {
            LogDisconnectFailed(ex);
        }

        await PublishAsync(() => translator.Disconnected(machineSwitchedOff: false)).ConfigureAwait(false);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            channel.Prepare();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            LogPrepareFailed(ex, channel.Options.Directory);
        }

        _stopping = stoppingToken;
        LogStarted(Config.SerialNumber, Config.MachineNumber, channel.Options.Directory);
        session.NotificationReceived = OnNotificationAsync;
        var reading = session.RunAsync(stoppingToken);

        // Until the machine answers, it is not connected.
        await PublishAsync(() => translator.Disconnected(machineSwitchedOff: false)).ConfigureAwait(false);

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                if (_connected)
                {
                    await HeartbeatAsync(stoppingToken).ConfigureAwait(false);
                    await Task.Delay(Config.HeartbeatInterval, stoppingToken).ConfigureAwait(false);
                }
                else
                {
                    await ConnectAsync(stoppingToken).ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Stopping.
        }

        await reading.ConfigureAwait(false);
    }

    private async Task ConnectAsync(CancellationToken cancellationToken)
    {
        var reply = await session.RequestAsync(CuttingCommands.Connect, [HostVersion], Config.ReplyTimeout, cancellationToken)
            .ConfigureAwait(false);
        if (reply is null)
        {
            // The machine is off or not yet up. It announces itself when it is (§2.5); try again at the latest
            // after one heartbeat interval.
            await _machineAnnounced.WaitAsync(Config.HeartbeatInterval, cancellationToken).ConfigureAwait(false);
            return;
        }

        _connected = true;
        Interlocked.Exchange(ref _missed, 0);
        LogConnected(Config.SerialNumber, reply[^1].Fields.Count);
        await PublishAsync(translator.Connected).ConfigureAwait(false);

        var info = await session.RequestAsync(CuttingCommands.MachineInfo, [Config.MachineNumber], Config.ReplyTimeout, cancellationToken)
            .ConfigureAwait(false);
        if (info is { Count: > 0 })
        {
            var planType = info[^1].Field(2);
            var typeCode = info[^1].Field(3);
            CheckMachineNumber(planType);
            LogMachineInfo(typeCode, planType);
        }
    }

    private async Task HeartbeatAsync(CancellationToken cancellationToken)
    {
        var reply = await session.RequestAsync(CuttingCommands.SystemTime, [Config.MachineNumber], Config.ReplyTimeout, cancellationToken)
            .ConfigureAwait(false);
        if (reply is { Count: > 0 })
        {
            Interlocked.Exchange(ref _missed, 0);
            CheckMachineNumber(reply[^1].Field(2));
            var count = Interlocked.Increment(ref _heartbeat);
            await PublishAsync(() => [.. translator.Repeat(), .. translator.Heartbeat(count)]).ConfigureAwait(false);
            return;
        }

        if (Interlocked.Increment(ref _missed) >= Config.MissedRepliesUntilDisconnected && _connected)
        {
            _connected = false;
            LogSilent(Config.SerialNumber, Config.MissedRepliesUntilDisconnected);
            await PublishAsync(() => translator.Disconnected(machineSwitchedOff: false)).ConfigureAwait(false);
        }
    }

    private async Task OnNotificationAsync(CuttingNotification notification)
    {
        switch (notification.Name)
        {
            case CuttingNotifications.ServerConnect:
                // A machine that starts (again) wants the host to connect anew (§2.5).
                LogMachineAnnounced(Config.SerialNumber);
                _connected = false;
                _machineAnnounced.Release();
                break;
            case CuttingNotifications.ServerDisconnect:
                LogMachineSwitchedOff(Config.SerialNumber);
                _connected = false;
                await PublishAsync(() => translator.Disconnected(machineSwitchedOff: true)).ConfigureAwait(false);
                break;
            default:
                await PublishAsync(() => translator.Translate(notification)).ConfigureAwait(false);
                if (notification.Name is CuttingNotifications.MachineRunning or CuttingNotifications.MachineStopped &&
                    Config.StateHold > TimeSpan.Zero)
                {
                    _ = ReleaseHeldStateAsync();
                }

                break;
        }
    }

    /// <summary>
    /// Publishes a held running or stopped state once its time is up, unless a program notification took it
    /// before (see <see cref="CuttingTranslator"/>).
    /// </summary>
    private async Task ReleaseHeldStateAsync()
    {
        try
        {
            // A little more than the hold, so that the state is surely due.
            await Task.Delay(Config.StateHold + TimeSpan.FromMilliseconds(20), _stopping).ConfigureAwait(false);
            await PublishAsync(translator.Due).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Stopping; StopAsync publishes what is held.
        }
    }

    /// <summary>A reply with -11 in field 2 says that the machine has another number than configured.</summary>
    private void CheckMachineNumber(string field)
    {
        if (field.Trim() == "-11" && !_wrongNumberLogged)
        {
            _wrongNumberLogged = true;
            LogWrongMachineNumber(Config.MachineNumber);
        }
    }

    /// <summary>Translates and publishes under one lock, so that values keep the order the machine sent them in.</summary>
    private async Task PublishAsync(Func<IReadOnlyList<Publication>> translate)
    {
        // Not cancelled by stopping: StopAsync still publishes that the machine is disconnected.
        await _gate.WaitAsync(CancellationToken.None).ConfigureAwait(false);
        try
        {
            await publisher.PublishAsync(translate()).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            LogPublishFailed(ex);
        }
        finally
        {
            _gate.Release();
        }
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Cutting adapter started for {SerialNumber}, machine number {MachineNumber}, telegram files in {Directory}.")]
    private partial void LogStarted(string serialNumber, string machineNumber, string directory);

    [LoggerMessage(Level = LogLevel.Information, Message = "{SerialNumber} connected; it answers {Count} commands.")]
    private partial void LogConnected(string serialNumber, int count);

    [LoggerMessage(Level = LogLevel.Information, Message = "MACHINFO: machine type {TypeCode}, production plan type {PlanType}.")]
    private partial void LogMachineInfo(string typeCode, string planType);

    [LoggerMessage(Level = LogLevel.Information, Message = "{SerialNumber} announced itself.")]
    private partial void LogMachineAnnounced(string serialNumber);

    [LoggerMessage(Level = LogLevel.Information, Message = "{SerialNumber} switched off.")]
    private partial void LogMachineSwitchedOff(string serialNumber);

    [LoggerMessage(Level = LogLevel.Warning, Message = "{SerialNumber} did not answer {Count} requests in a row; it counts as disconnected.")]
    private partial void LogSilent(string serialNumber, int count);

    [LoggerMessage(Level = LogLevel.Error,
        Message = "The machine rejects the machine number {MachineNumber} (-11). Set Config__MachineNumber to the number of the machine.")]
    private partial void LogWrongMachineNumber(string machineNumber);

    [LoggerMessage(Level = LogLevel.Error, Message = "Could not prepare the folder {Directory} for the telegram files.")]
    private partial void LogPrepareFailed(Exception exception, string directory);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not send SRC9DISC.")]
    private partial void LogDisconnectFailed(Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not publish to the broker.")]
    private partial void LogPublishFailed(Exception exception);
}
