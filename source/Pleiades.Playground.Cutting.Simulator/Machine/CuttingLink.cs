using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Cutting.Protocol.Transport;

namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>
/// The way out of the machine: writes replies and notifications into the machine file and logs them.
/// </summary>
/// <remarks>
/// A machine that is off writes nothing. A notification waits for a host: until the host has connected with
/// <c>SRC9CONN</c>, the simulator logs it as held and does not write it, so that the file does not grow
/// without a reader. Only the connect and disconnect notifications of the machine go out without a host
/// (§2.5).
/// </remarks>
internal sealed partial class CuttingLink(
    CuttingFileChannel channel,
    CuttingMachine machine,
    TelegramLog log,
    TimeProvider time,
    ILogger<CuttingLink> logger)
{
    /// <summary>The time of the machine, for the timestamps of notifications.</summary>
    public DateTime Now => time.GetLocalNow().DateTime;

    /// <summary>The current time as a field.</summary>
    public string Timestamp => CuttingFormat.Timestamp(Now);

    /// <summary>
    /// Sends one notification.
    /// </summary>
    public Task NotifyAsync(string name, params IReadOnlyList<string> fields)
    {
        return SendAsync([CuttingNotification.Create(name, fields)], CancellationToken.None);
    }

    /// <summary>
    /// Sends telegrams in one write, keeping their order.
    /// </summary>
    public async Task SendAsync(IReadOnlyList<CuttingMessage> telegrams, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(telegrams);
        var send = new List<CuttingMessage>(telegrams.Count);
        foreach (var telegram in telegrams)
        {
            var reason = HoldReason(telegram);
            if (reason is null)
            {
                send.Add(telegram);
            }
            else
            {
                log.Add(TelegramDirection.Held, NameOf(telegram), telegram.Format(), reason);
            }
        }

        if (send.Count == 0)
        {
            return;
        }

        try
        {
            if (await channel.SendAsync(send, cancellationToken).ConfigureAwait(false))
            {
                foreach (var telegram in send)
                {
                    log.Add(TelegramDirection.Out, NameOf(telegram), telegram.Format());
                }

                return;
            }

            foreach (var telegram in send)
            {
                log.Add(TelegramDirection.Error, NameOf(telegram), telegram.Format(), "The host did not release the file in time.");
            }
        }
        catch (IOException ex)
        {
            LogWriteFailed(ex, channel.Options.OwnFile);
            foreach (var telegram in send)
            {
                log.Add(TelegramDirection.Error, NameOf(telegram), telegram.Format(), ex.Message);
            }
        }
        catch (UnauthorizedAccessException ex)
        {
            LogWriteFailed(ex, channel.Options.OwnFile);
            log.Add(TelegramDirection.Error, string.Empty, string.Empty, ex.Message);
        }
    }

    public static string NameOf(CuttingMessage message)
    {
        return message switch
        {
            CuttingTelegram t => t.Command,
            CuttingNotification n => n.Name,
            _ => string.Empty,
        };
    }

    private string? HoldReason(CuttingMessage telegram)
    {
        if (telegram is CuttingNotification { Name: CuttingNotifications.ServerConnect or CuttingNotifications.ServerDisconnect })
        {
            return null;
        }

        if (!machine.Online)
        {
            return "The machine is off.";
        }

        return telegram is CuttingNotification && !machine.HostConnected
            ? "No host has connected with SRC9CONN."
            : null;
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not write the telegram file {Path}.")]
    private partial void LogWriteFailed(Exception exception, string path);
}
