using System.Text.Json;
using Pleiades.Playground.OpcUa.Adapter.Mapping;

namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>
/// Remembers the alarms that stand, per machine. Without it an alarm that goes while the adapter is
/// down would stay open in the Events API for ever, because nobody would know to reset it.
/// </summary>
internal sealed class AlertStore
{
    private readonly string _directory;

    /// <summary>Creates the store below <paramref name="dataDirectory"/>.</summary>
    public AlertStore(string dataDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(dataDirectory);
        _directory = Path.Combine(dataDirectory, "alerts");
        Directory.CreateDirectory(_directory);
    }

    /// <summary>The alarms that stood when they were last saved. None if nothing readable is there.</summary>
    public IReadOnlyList<OpenAlert> Load(string serialNumber)
    {
        try
        {
            var file = FileOf(serialNumber);
            return File.Exists(file)
                ? JsonSerializer.Deserialize<List<OpenAlert>>(File.ReadAllText(file), RegistrationJson.Options) ?? []
                : [];
        }
        catch (Exception exception) when (exception is JsonException or IOException or UnauthorizedAccessException)
        {
            return [];
        }
    }

    /// <summary>Saves the alarms that stand now.</summary>
    public void Save(string serialNumber, IEnumerable<OpenAlert> open)
    {
        try
        {
            // Written beside and moved, as a registration is: a crash leaves the old list or the new one, never half of one.
            var file = FileOf(serialNumber);
            var temporary = file + ".tmp";
            File.WriteAllText(temporary, JsonSerializer.Serialize(open, RegistrationJson.Options));
            File.Move(temporary, file, overwrite: true);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            // The alarms are still published. Only the catching up after a restart is lost.
        }
    }

    /// <summary>Forgets the alarms of a machine that is removed.</summary>
    public void Delete(string serialNumber)
    {
        var file = FileOf(serialNumber);
        if (File.Exists(file))
        {
            File.Delete(file);
        }
    }

    private string FileOf(string serialNumber) => Path.Combine(_directory, Uri.EscapeDataString(serialNumber) + ".json");
}
