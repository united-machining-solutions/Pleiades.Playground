namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>
/// Reads and writes a small file of the data directory whole: a write goes to a file beside and is moved over the old
/// one, so a crash leaves the old file or the new one, never half of one. On Windows a virus scanner or the indexer may
/// hold a file that was just written for a moment, and the move then fails with an
/// <see cref="UnauthorizedAccessException"/> or an <see cref="IOException"/>; both are tried again a few times, with a
/// short pause, before the error is passed on.
/// </summary>
internal static class AtomicFile
{
    /// <summary>How often a read or a move is tried before its error is passed on.</summary>
    public const int Attempts = 5;

    /// <summary>The pause before the second try; each further try waits once more as long.</summary>
    public static readonly TimeSpan Pause = TimeSpan.FromMilliseconds(50);

    /// <summary>Writes <paramref name="content"/> to <paramref name="path"/> whole, with <paramref name="mode"/> on Linux if given.</summary>
    public static void Write(string path, string content, UnixFileMode? mode = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var next = path + ".new";
        Retry(() => File.WriteAllText(next, content));
        if (mode is { } unix && !OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(next, unix);
        }

        Retry(() => File.Move(next, path, overwrite: true));
    }

    /// <summary>The text of <paramref name="path"/>.</summary>
    public static string ReadAllText(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var text = string.Empty;
        Retry(() => text = File.ReadAllText(path));
        return text;
    }

    private static void Retry(Action action)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                action();
                return;
            }
            catch (Exception exception) when (attempt < Attempts && exception is IOException or UnauthorizedAccessException)
            {
                Thread.Sleep(Pause * attempt);
            }
        }
    }
}
