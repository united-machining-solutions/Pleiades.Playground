using System.Globalization;

namespace Pleiades.Playground.Bend.Protocol.Transport;

/// <summary>A message file that is new or was written again since the last look.</summary>
public sealed record MessageFile(string Path, DateTime WrittenAtUtc, int Number);

/// <summary>
/// Finds the message files of the machine in its RCI transfer directory. It only reads: a file the
/// server takes away is simply gone, a file that is written again (the machine counts from 1 again after
/// a restart) is new.
/// </summary>
public sealed class RciExchangeDirectory
{
    private readonly string _directory;
    private readonly string _prefix;
    private readonly Dictionary<string, (DateTime WrittenAtUtc, long Length)> _seen = new(StringComparer.Ordinal);

    /// <param name="directory">The exchange folder.</param>
    /// <param name="prefix">The name of the message files without the running number and <c>.xml</c>.</param>
    public RciExchangeDirectory(string directory, string prefix)
    {
        _directory = directory ?? throw new ArgumentNullException(nameof(directory));
        _prefix = prefix ?? throw new ArgumentNullException(nameof(prefix));
    }

    /// <summary>The files that are new or changed, oldest first.</summary>
    /// <param name="settledBefore">A file written after this time (UTC) may still be written to and waits for the next look.</param>
    public IReadOnlyList<MessageFile> FindNew(DateTime settledBefore)
    {
        if (!Directory.Exists(_directory))
        {
            return [];
        }

        var found = new List<MessageFile>();
        var present = new HashSet<string>(StringComparer.Ordinal);
        foreach (var path in Directory.EnumerateFiles(_directory, $"{_prefix}*.xml"))
        {
            present.Add(path);
            var info = new FileInfo(path);
            if (!info.Exists || info.LastWriteTimeUtc > settledBefore)
            {
                continue;
            }

            if (_seen.TryGetValue(path, out var seen) && seen.WrittenAtUtc == info.LastWriteTimeUtc && seen.Length == info.Length)
            {
                continue;
            }

            found.Add(new MessageFile(path, info.LastWriteTimeUtc, NumberOf(path)));
        }

        // Forget files that are gone, so a file written again under the same name counts as new.
        foreach (var gone in _seen.Keys.Where(path => !present.Contains(path)).ToList())
        {
            _seen.Remove(gone);
        }

        // The number orders files written within the same tick of the file system clock.
        return found.OrderBy(file => file.WrittenAtUtc).ThenBy(file => file.Number).ToList();
    }

    /// <summary>Marks a file as read, so it is not read again until it is written again.</summary>
    public void MarkRead(MessageFile file)
    {
        ArgumentNullException.ThrowIfNull(file);
        var info = new FileInfo(file.Path);
        if (info.Exists)
        {
            _seen[file.Path] = (info.LastWriteTimeUtc, info.Length);
        }
    }

    private int NumberOf(string path)
    {
        var name = System.IO.Path.GetFileNameWithoutExtension(path);
        return int.TryParse(name.AsSpan(_prefix.Length), NumberStyles.None, CultureInfo.InvariantCulture, out var number) ? number : 0;
    }
}
