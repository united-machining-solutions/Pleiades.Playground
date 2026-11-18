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
                    registrations.Add(Migrate(registration));
                }
            }
            catch (Exception exception) when (exception is JsonException or IOException or UnauthorizedAccessException)
            {
                onUnreadable?.Invoke(file, exception);
            }
        }

        return registrations;
    }

    /// <summary>
    /// A registration of an earlier version as this adapter runs it. Version 1 gave numbers in coherent SI
    /// units; the binding of machines carries the units of the catalogue. An element of the model whose unit
    /// differs from its catalogue is moved over where the two are the same quantity: <c>joule</c> becomes
    /// <c>wattHour</c> (scale and offset divided by 3600), a count in <c>one</c> becomes <c>piece</c>, and a year
    /// loses its unit. In every version the area <c>vendor</c> becomes <c>oem</c>.
    /// </summary>
    internal static MachineRegistration Migrate(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        var elements = registration.SchemaVersion >= MachineRegistration.CurrentSchemaVersion
            ? registration.Elements
            : [.. registration.Elements.Select(MigrateUnit)];
        if (registration.SchemaVersion >= MachineRegistration.CurrentSchemaVersion
            && !elements.Any(element => element.Area == Mapping.Topics.FormerOemArea))
        {
            return registration;
        }

        return registration with
        {
            SchemaVersion = MachineRegistration.CurrentSchemaVersion,
            // The area of a signal of the maker is named as the namespace level of the binding.
            Elements = [.. elements.Select(element => element.Area == Mapping.Topics.FormerOemArea ? element with { Area = Mapping.Topics.OemArea } : element)],
        };
    }

    private static ElementRegistration MigrateUnit(ElementRegistration element)
    {
        if (element.Area == Mapping.Topics.ModelArea && Mapping.CatalogueUnits.WithoutUnit.Contains(element.Path))
        {
            return element with { Unit = null };
        }

        if (element.Area != Mapping.Topics.ModelArea || element.Kind != ValueKind.Number
            || Mapping.CatalogueUnits.Of(element.Path) is not { } unit || unit == element.Unit)
        {
            return element;
        }

        return (element.Unit, unit) switch
        {
            ("joule", "wattHour") => element with
            {
                Unit = unit,
                Scale = (element.Scale ?? 1) / 3600,
                Offset = element.Offset is { } offset ? offset / 3600 : null,
            },
            ("one", "piece") => element with { Unit = unit },
            _ => element,
        };
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
