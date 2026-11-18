using System.Diagnostics.CodeAnalysis;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Cutting.Protocol.Transport;

namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>
/// Switches the machine on at start and off at stop, and in between looks for telegrams of the host and answers
/// them. A machine that is switched off does not read.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed partial class CuttingLinkService(
    CuttingFileChannel channel,
    CuttingMachine machine,
    MachineActions actions,
    CommandDispatcher dispatcher,
    TelegramLog log,
    IOptions<Config> config,
    ILogger<CuttingLinkService> logger) : BackgroundService
{
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

        LogStarted(machine.Type, machine.MachineNumber, channel.Options.Directory);
        await actions.PowerOnAsync().ConfigureAwait(false);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (machine.Online)
                {
                    await ReceiveAsync(stoppingToken).ConfigureAwait(false);
                }

                await Task.Delay(config.Value.PollInterval, stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                LogReceiveFailed(ex, channel.Options.PeerFile);
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken).ConfigureAwait(false);
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        await base.StopAsync(cancellationToken).ConfigureAwait(false);
        if (machine.Online)
        {
            await actions.PowerOffAsync().ConfigureAwait(false);
        }
    }

    private async Task ReceiveAsync(CancellationToken cancellationToken)
    {
        foreach (var line in await channel.ReceiveAsync(cancellationToken).ConfigureAwait(false))
        {
            if (!CuttingTelegramParser.TryParse(line, out var message, out var error))
            {
                log.Add(TelegramDirection.Error, string.Empty, line, error ?? "Not a telegram.");
                continue;
            }

            log.Add(TelegramDirection.In, CuttingLink.NameOf(message), line);
            if (message is CuttingTelegram { Kind: CuttingTelegramKind.Request } request)
            {
                await dispatcher.HandleAsync(request, cancellationToken).ConfigureAwait(false);
            }
            else
            {
                log.Add(TelegramDirection.Error, CuttingLink.NameOf(message), line, "The machine only answers requests (R).");
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Information,
        Message = "Cutting simulator started: {MachineType} number {MachineNumber}, telegram files in {Directory}.")]
    private partial void LogStarted(Pleiades.Playground.Cutting.Protocol.Model.CuttingMachineType machineType, string machineNumber, string directory);

    [LoggerMessage(Level = LogLevel.Error, Message = "Could not prepare the folder {Directory} for the telegram files.")]
    private partial void LogPrepareFailed(Exception exception, string directory);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not read the telegram file {Path}.")]
    private partial void LogReceiveFailed(Exception exception, string path);
}
