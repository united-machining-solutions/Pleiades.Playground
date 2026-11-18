using System.Collections.Concurrent;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Cutting.Protocol.Transport;

namespace Pleiades.Playground.Cutting.Adapter;

/// <summary>
/// The host side of the protocol: sends requests, pairs each reply with its request by the transaction number,
/// and hands every notification to <see cref="NotificationReceived"/> in the order the machine wrote them.
/// </summary>
/// <remarks>
/// <see cref="RunAsync"/> reads the machine file in a loop; <see cref="RequestAsync"/> may be called meanwhile.
/// A reply in several telegrams (<c>A</c> … <c>L</c>, §3.5) is collected until the last one.
/// </remarks>
internal sealed partial class CuttingHostSession(CuttingFileChannel channel, TimeSpan pollInterval, ILogger<CuttingHostSession> logger)
{
    private readonly ConcurrentDictionary<string, Pending> _pending = new(StringComparer.Ordinal);
    private long _transaction;

    /// <summary>Called for each notification of the machine, one after the other.</summary>
    public Func<CuttingNotification, Task>? NotificationReceived { get; set; }

    /// <summary>
    /// Sends a request and waits for its last reply. Returns <see langword="null"/> when no reply came in time,
    /// or when the machine has not yet read the previous request: a machine that is off reads nothing, and the
    /// host file shall not grow meanwhile.
    /// </summary>
    public async Task<IReadOnlyList<CuttingTelegram>?> RequestAsync(
        string command, IReadOnlyList<string> fields, TimeSpan timeout, CancellationToken cancellationToken)
    {
        if (File.Exists(channel.Options.OwnFile))
        {
            return null;
        }

        var request = CuttingTelegram.Request(command, Interlocked.Increment(ref _transaction), fields);
        var pending = new Pending();
        _pending[request.TransactionNumber] = pending;
        try
        {
            if (!await channel.SendAsync([request], cancellationToken).ConfigureAwait(false))
            {
                return null;
            }

            return await pending.Completion.Task.WaitAsync(timeout, cancellationToken).ConfigureAwait(false);
        }
        catch (TimeoutException)
        {
            return null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            // A file the adapter cannot write is a request without a reply, as one the machine does not answer.
            LogWriteFailed(ex, channel.Options.OwnFile);
            return null;
        }
        finally
        {
            _pending.TryRemove(request.TransactionNumber, out _);
        }
    }

    /// <summary>Reads the machine file until <paramref name="cancellationToken"/> ends it.</summary>
    public async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                foreach (var line in await channel.ReceiveAsync(cancellationToken).ConfigureAwait(false))
                {
                    await HandleAsync(line).ConfigureAwait(false);
                }

                await Task.Delay(pollInterval, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                LogReadFailed(ex, channel.Options.PeerFile);
                await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private async Task HandleAsync(string line)
    {
        if (!CuttingTelegramParser.TryParse(line, out var message, out var error))
        {
            LogNotATelegram(line, error ?? string.Empty);
            return;
        }

        switch (message)
        {
            case CuttingNotification notification when NotificationReceived is { } handler:
                await handler(notification).ConfigureAwait(false);
                break;
            case CuttingTelegram { Kind: CuttingTelegramKind.Append or CuttingTelegramKind.Last } reply
                when _pending.TryGetValue(reply.TransactionNumber, out var pending):
                pending.Replies.Add(reply);
                if (reply.Kind == CuttingTelegramKind.Last)
                {
                    pending.Completion.TrySetResult(pending.Replies);
                }

                break;
            case CuttingTelegram reply:
                LogUnexpectedReply(reply.Command, reply.TransactionNumber);
                break;
        }
    }

    private sealed class Pending
    {
        public List<CuttingTelegram> Replies { get; } = [];

        public TaskCompletionSource<IReadOnlyList<CuttingTelegram>> Completion { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not read the telegram file {Path}.")]
    private partial void LogReadFailed(Exception exception, string path);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Could not write the telegram file {Path}; the request counts as unanswered.")]
    private partial void LogWriteFailed(Exception exception, string path);

    [LoggerMessage(Level = LogLevel.Warning, Message = "The machine wrote a line that is not a telegram ({Error}): {Line}")]
    private partial void LogNotATelegram(string line, string error);

    [LoggerMessage(Level = LogLevel.Debug, Message = "A reply to {Command} with transaction {Transaction} came after its request was given up.")]
    private partial void LogUnexpectedReply(string command, string transaction);
}
