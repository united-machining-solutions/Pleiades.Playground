using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Protocol.Transport;

/// <summary>
/// Sends and receives telegrams through the telegram files and their semaphore files (specification §2.2).
/// </summary>
/// <remarks>
/// <para>
/// Each side writes its own <c>X.dat</c> and reads the one of the other side. <c>X.wr</c> says that someone
/// writes <c>X.dat</c>, <c>X.rd</c> that someone reads it. At rest there is no semaphore file.
/// </para>
/// <para>
/// Writing: wait until <c>X.rd</c> is gone, create <c>X.wr</c>, look again for <c>X.rd</c> (and step back if
/// it came), append the telegrams, delete <c>X.wr</c>. Reading: wait until <c>X.wr</c> is gone, create
/// <c>X.rd</c>, look again for <c>X.wr</c>, read and delete <c>X.dat</c>, delete <c>X.rd</c>.
/// </para>
/// <para>
/// The channel has no file system watcher. <see cref="ReceiveAsync"/> looks once; the caller polls. Change
/// notifications do not cross every volume, a shared Docker volume or a Windows share among them.
/// </para>
/// </remarks>
public sealed partial class CuttingFileChannel : IDisposable
{
    private readonly CuttingChannelOptions _options;
    private readonly ILogger _logger;
    private readonly SemaphoreSlim _sendLock = new(1, 1);

    /// <summary>
    /// Creates a channel.
    /// </summary>
    /// <param name="options">The files and timeouts.</param>
    /// <param name="logger">The logger.</param>
    public CuttingFileChannel(CuttingChannelOptions options, ILogger<CuttingFileChannel>? logger = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        _options = options;
        _logger = (ILogger?)logger ?? NullLogger.Instance;
    }

    /// <summary>The files and timeouts.</summary>
    public CuttingChannelOptions Options => _options;

    /// <summary>
    /// Creates the folder and deletes the semaphore files only this side creates, left over from a crash:
    /// the write semaphore of its own file and the read semaphore of the file of the other side.
    /// </summary>
    public void Prepare()
    {
        Directory.CreateDirectory(_options.Directory);
        DeleteIfExists(WriteLock(_options.OwnFile));
        DeleteIfExists(ReadLock(_options.PeerFile));
    }

    /// <summary>
    /// Appends telegrams to the own file.
    /// </summary>
    /// <param name="telegrams">The telegrams, each one line.</param>
    /// <param name="cancellationToken">Cancels the wait.</param>
    /// <returns>Whether the telegrams were written; <see langword="false"/> after the lock timeout.</returns>
    public async Task<bool> SendAsync(IEnumerable<CuttingMessage> telegrams, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(telegrams);
        var lines = telegrams.Select(t => t.Format()).ToList();
        if (lines.Count == 0)
        {
            return true;
        }

        await _sendLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            return await WriteAsync(lines, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _sendLock.Release();
        }
    }

    /// <summary>
    /// Reads and removes what the other side has written, if anything.
    /// </summary>
    /// <param name="cancellationToken">Cancels the wait.</param>
    /// <returns>The lines that were in the file, empty ones left out.</returns>
    public async Task<IReadOnlyList<string>> ReceiveAsync(CancellationToken cancellationToken = default)
    {
        var file = _options.PeerFile;
        if (!File.Exists(file))
        {
            return [];
        }

        var writeLock = WriteLock(file);
        var readLock = ReadLock(file);
        var deadline = DateTime.UtcNow + _options.LockTimeout;

        while (true)
        {
            if (!await WaitUntilGoneAsync(writeLock, deadline, cancellationToken).ConfigureAwait(false))
            {
                LogLockTimeout(writeLock);
                return [];
            }

            Touch(readLock);
            if (!File.Exists(writeLock))
            {
                break;
            }

            // The other side started to write between our look and our semaphore: step back and wait again.
            DeleteIfExists(readLock);
        }

        try
        {
            var bytes = await File.ReadAllBytesAsync(file, cancellationToken).ConfigureAwait(false);
            File.Delete(file);
            // No trimming: a notification starts with eight spaces.
            return CuttingFormat.Encoding.GetString(bytes)
                .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries)
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .ToList();
        }
        finally
        {
            DeleteIfExists(readLock);
        }
    }

    /// <inheritdoc />
    public void Dispose()
    {
        _sendLock.Dispose();
    }

    private async Task<bool> WriteAsync(List<string> lines, CancellationToken cancellationToken)
    {
        var file = _options.OwnFile;
        var writeLock = WriteLock(file);
        var readLock = ReadLock(file);
        var deadline = DateTime.UtcNow + _options.LockTimeout;

        while (true)
        {
            if (!await WaitUntilGoneAsync(readLock, deadline, cancellationToken).ConfigureAwait(false))
            {
                LogLockTimeout(readLock);
                return false;
            }

            Touch(writeLock);
            if (!File.Exists(readLock))
            {
                break;
            }

            DeleteIfExists(writeLock);
        }

        try
        {
            var text = string.Concat(lines.Select(l => l + _options.LineBreak));
            var bytes = CuttingFormat.Encoding.GetBytes(text);
            var stream = new FileStream(file, FileMode.Append, FileAccess.Write, FileShare.Read);
            await using (stream.ConfigureAwait(false))
            {
                await stream.WriteAsync(bytes, cancellationToken).ConfigureAwait(false);
            }

            return true;
        }
        finally
        {
            DeleteIfExists(writeLock);
        }
    }

    private async Task<bool> WaitUntilGoneAsync(string path, DateTime deadline, CancellationToken cancellationToken)
    {
        while (File.Exists(path))
        {
            if (DateTime.UtcNow > deadline)
            {
                return false;
            }

            await Task.Delay(_options.RetryInterval, cancellationToken).ConfigureAwait(false);
        }

        return true;
    }

    private static string WriteLock(string datFile)
    {
        return Path.ChangeExtension(datFile, ".wr");
    }

    private static string ReadLock(string datFile)
    {
        return Path.ChangeExtension(datFile, ".rd");
    }

    private static void Touch(string path)
    {
        using var _ = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete);
    }

    private static void DeleteIfExists(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    [LoggerMessage(Level = LogLevel.Warning,
        Message = "The semaphore file {Path} stayed longer than the lock timeout. The other side may have crashed; delete it by hand if it stays.")]
    private partial void LogLockTimeout(string path);
}
