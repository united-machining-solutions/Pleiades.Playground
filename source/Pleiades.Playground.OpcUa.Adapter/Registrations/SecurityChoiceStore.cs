using System.Text.Json;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;

namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>The security a person chose for the sessions to one server, in place of the strongest one.</summary>
/// <param name="SecurityMode">The message security mode.</param>
/// <param name="SecurityPolicy">The short name of the security policy, for example <c>Basic256Sha256</c>, or <c>None</c>.</param>
internal sealed record SecurityChoice(SecurityMode SecurityMode, string SecurityPolicy)
{
    /// <summary>Whether an endpoint has this security.</summary>
    public bool Matches(SecurityMode mode, string policy) =>
        mode == SecurityMode && string.Equals(policy, SecurityPolicy, StringComparison.Ordinal);
}

/// <summary>A server and the security a person chose for it.</summary>
/// <param name="Url">The address of the server, normalized: one entry per server.</param>
/// <param name="Choice">The security.</param>
internal sealed record StoredSecurityChoice(string Url, SecurityChoice Choice);

/// <summary>
/// The security a person chose for a server, one choice per server, in <c>security.json</c> below the data
/// directory. Without a choice the adapter takes the strongest endpoint the server offers. A person chooses on
/// the endpoints card of the chat; the app sends the choice to the management API, never the language model,
/// so a weaker endpoint, one without security included, is always the decision of a person.
/// </summary>
internal sealed class SecurityChoiceStore
{
    private readonly string _file;
    private readonly Lock _gate = new();
    private readonly Action<string>? _onUnreadable;

    /// <summary>Creates the store below <paramref name="dataDirectory"/>.</summary>
    /// <param name="dataDirectory">The data directory of the adapter.</param>
    /// <param name="onUnreadable">Told why the file could not be read; it is then moved aside and the store is empty.</param>
    public SecurityChoiceStore(string dataDirectory, Action<string>? onUnreadable = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(dataDirectory);
        _onUnreadable = onUnreadable;
        Directory.CreateDirectory(dataDirectory);
        _file = Path.Combine(dataDirectory, "security.json");
    }

    /// <summary>The security a person chose for the server at <paramref name="url"/>, or null for the strongest.</summary>
    public SecurityChoice? Find(string url)
    {
        lock (_gate)
        {
            return Read().GetValueOrDefault(EndpointKey.Normalize(url));
        }
    }

    /// <summary>Every server with a chosen security.</summary>
    public IReadOnlyList<StoredSecurityChoice> Choices
    {
        get
        {
            lock (_gate)
            {
                return [.. Read().OrderBy(pair => pair.Key, StringComparer.Ordinal).Select(pair => new StoredSecurityChoice(pair.Key, pair.Value))];
            }
        }
    }

    /// <summary>Keeps the security for the server at <paramref name="url"/>, in place of one chosen before.</summary>
    public void Save(string url, SecurityChoice choice)
    {
        ArgumentNullException.ThrowIfNull(choice);
        lock (_gate)
        {
            var all = Read();
            all[EndpointKey.Normalize(url)] = choice;
            Write(all);
        }
    }

    /// <summary>Forgets the security chosen for the server at <paramref name="url"/>. Returns whether there was one.</summary>
    public bool Remove(string url)
    {
        lock (_gate)
        {
            var all = Read();
            if (!all.Remove(EndpointKey.Normalize(url)))
            {
                return false;
            }

            Write(all);
            return true;
        }
    }

    private Dictionary<string, SecurityChoice> Read()
    {
        if (!File.Exists(_file))
        {
            return new Dictionary<string, SecurityChoice>(StringComparer.Ordinal);
        }

        try
        {
            var read = JsonSerializer.Deserialize<Dictionary<string, SecurityChoice>>(AtomicFile.ReadAllText(_file), RegistrationJson.Options);
            return new Dictionary<string, SecurityChoice>(read ?? [], StringComparer.Ordinal);
        }
        catch (JsonException exception)
        {
            // A broken file must not take every request down. Kept beside, so a person can repair it; until then
            // every server is reached on its strongest endpoint, which is the safe side.
            var aside = _file + ".unreadable";
            File.Move(_file, aside, overwrite: true);
            _onUnreadable?.Invoke($"{exception.Message} It is kept as {aside}; every server is reached on its strongest endpoint until a person chooses again.");
            return new Dictionary<string, SecurityChoice>(StringComparer.Ordinal);
        }
    }

    private void Write(Dictionary<string, SecurityChoice> all) =>
        AtomicFile.Write(_file, JsonSerializer.Serialize(all, RegistrationJson.Options));
}
