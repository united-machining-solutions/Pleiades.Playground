using System.Text.Json;

namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>
/// Keeps the registrations as one JSON file per machine. A file is the whole truth about a machine:
/// copy it to another adapter and that machine runs there.
/// </summary>
internal sealed class RegistrationStore
{
    private readonly string _directory;

    /// <summary>Creates the store below <paramref name="dataDirectory"/>.</summary>
    public RegistrationStore(string dataDirectory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(dataDirectory);
        _directory = Path.Combine(dataDirectory, "machines");
        Directory.CreateDirectory(_directory);
    }

    /// <summary>Every stored registration. A file that cannot be read is reported and skipped.</summary>
    public IReadOnlyList<MachineRegistration> LoadAll(Action<string, Exception>? onUnreadable = null)
    {
        var registrations = new List<MachineRegistration>();
        foreach (var file in Directory.EnumerateFiles(_directory, "*.json").Order(StringComparer.Ordinal))
        {
            try
            {
                var registration = JsonSerializer.Deserialize<MachineRegistration>(File.ReadAllText(file), RegistrationJson.Options);
                if (registration is not null)
                {
                    registrations.Add(registration);
                }
            }
            catch (Exception exception) when (exception is JsonException or IOException or UnauthorizedAccessException)
            {
                onUnreadable?.Invoke(file, exception);
            }
        }

        return registrations;
    }

    /// <summary>Writes a registration, replacing the one of the same machine.</summary>
    public void Save(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        var file = FileOf(registration.SerialNumber);
        var temporary = file + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(registration, RegistrationJson.Options));
        File.Move(temporary, file, overwrite: true);
    }

    /// <summary>Deletes the registration of a machine. Returns false if there was none.</summary>
    public bool Delete(string serialNumber)
    {
        var file = FileOf(serialNumber);
        if (!File.Exists(file))
        {
            return false;
        }

        File.Delete(file);
        return true;
    }

    // A serial number holds no '/', and escaping takes '\' and ':' too, so the name stays in the folder.
    private string FileOf(string serialNumber) => Path.Combine(_directory, Uri.EscapeDataString(serialNumber) + ".json");
}
