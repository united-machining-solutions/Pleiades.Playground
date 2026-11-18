using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.Ultimaker.Api;

internal sealed class ArtifactStore(IOptions<UltimakerOptions> options)
{
    private readonly string _root = Path.GetFullPath(options.Value.DataDirectory);
    public int MaximumModelBytes => options.Value.MaximumModelBytes;

    public string DirectoryFor(string id)
    {
        if (!Guid.TryParseExact(id, "N", out _))
            throw new ArgumentException("Artifact ID must be a server-generated UUID without separators.");
        return Path.Combine(_root, id);
    }

    public string NewDirectory(out string id)
    {
        id = Guid.NewGuid().ToString("N");
        var directory = DirectoryFor(id);
        Directory.CreateDirectory(directory);
        return directory;
    }

    public async Task<ModelArtifact> StoreModelAsync(Stream input, CancellationToken token)
    {
        var directory = NewDirectory(out var id);
        try
        {
            using var buffer = new MemoryStream();
            var chunk = new byte[81920];
            int read;
            while ((read = await input.ReadAsync(chunk, token).ConfigureAwait(false)) > 0)
            {
                if (buffer.Length + read > MaximumModelBytes)
                    throw new ArgumentException("STL exceeds the configured model size limit.");
                await buffer.WriteAsync(chunk.AsMemory(0, read), token).ConfigureAwait(false);
            }
            var normalized = StlModel.Normalize(buffer.ToArray());
            await File.WriteAllBytesAsync(Path.Combine(directory, "model.stl"), normalized, token).ConfigureAwait(false);
            var result = new ModelArtifact(id, Hash(normalized), normalized.LongLength);
            await WriteAsync(Path.Combine(directory, "model.json"), result, token).ConfigureAwait(false);
            return result;
        }
        catch
        {
            Directory.Delete(directory, true);
            throw;
        }
    }

    public string ModelPath(string id)
    {
        var path = Path.Combine(DirectoryFor(id), "model.stl");
        if (!File.Exists(path)) throw new FileNotFoundException("Stored STL does not exist.");
        return path;
    }

    public async Task<SliceArtifact> GetSliceAsync(string id, CancellationToken token)
    {
        var path = Path.Combine(DirectoryFor(id), "slice.json");
        if (!File.Exists(path)) throw new FileNotFoundException("Completed slice does not exist.");
        return JsonSerializer.Deserialize<SliceArtifact>(await File.ReadAllTextAsync(path, token).ConfigureAwait(false))
            ?? throw new InvalidDataException("Invalid slice metadata.");
    }

    public string GcodePath(string id) => Path.Combine(DirectoryFor(id), "output.gcode");
    public async Task<(SliceArtifact Slice, byte[] Bytes)> ReadCheckedSliceAsync(string id, CancellationToken token)
    {
        var slice = await GetSliceAsync(id, token).ConfigureAwait(false);
        var bytes = await File.ReadAllBytesAsync(GcodePath(id), token).ConfigureAwait(false);
        if (Hash(bytes) != slice.Sha256) throw new InvalidDataException("G-code SHA-256 does not match stored metadata.");
        GcodeHeader.Read(bytes);
        GcodeValidation.CompleteAndValidate(bytes, slice.MaterialId);
        return (slice, bytes);
    }

    internal Task SaveSubmissionAsync(PrintSubmission submission, CancellationToken token)
    {
        // Use the same strict UUID validation as artifacts before building a journal path.
        DirectoryFor(submission.Id);
        var directory = Path.Combine(_root, "print-submissions");
        Directory.CreateDirectory(directory);
        return WriteAsync(Path.Combine(directory, submission.Id + ".json"), submission, token);
    }

    internal async Task<IReadOnlyList<PrintSubmission>> ReadSubmissionsAsync(CancellationToken token)
    {
        var directory = Path.Combine(_root, "print-submissions");
        if (!Directory.Exists(directory)) return [];
        var result = new List<PrintSubmission>();
        foreach (var path in Directory.EnumerateFiles(directory, "*.json"))
        {
            var record = JsonSerializer.Deserialize<PrintSubmission>(
                await File.ReadAllTextAsync(path, token).ConfigureAwait(false))
                ?? throw new InvalidDataException("Invalid print-submission journal entry.");
            result.Add(record);
        }
        return result.OrderByDescending(s => s.CreatedAt).ThenBy(s => s.Id, StringComparer.Ordinal).ToArray();
    }

    public async Task<PrintSubmissionPage> SlicePrintsAsync(string sliceId, int offset, int count, CancellationToken token)
    {
        ValidatePage(offset, count);
        await GetSliceAsync(sliceId, token).ConfigureAwait(false);
        var records = await ReadSubmissionsAsync(token).ConfigureAwait(false);
        var page = records.Where(s => s.SliceId == sliceId).Skip(offset).Take(count).ToArray();
        return new(offset, count, page.Length == count ? checked(offset + page.Length) : null, page);
    }

    internal static void ValidatePage(int offset, int count)
    {
        if (offset < 0 || offset > int.MaxValue - 100 || count is < 1 or > 100)
            throw new ArgumentException("Paging requires offset >= 0 (at most Int32.MaxValue - 100) and count between 1 and 100.");
    }
    public static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
    internal static async Task WriteAsync<T>(string path, T value, CancellationToken token)
    {
        var temporary = path + ".tmp";
        await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(value), token).ConfigureAwait(false);
        File.Move(temporary, path, true);
    }
}
