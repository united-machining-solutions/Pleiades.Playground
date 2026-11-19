using System.Text.Json;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;

namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>The user an OPC UA server is logged in to with, without the password.</summary>
/// <param name="Url">The address of the server, normalized: one entry per server.</param>
/// <param name="User">The user name.</param>
internal sealed record StoredUser(string Url, string User);

/// <summary>A user name with its password, for one server.</summary>
/// <param name="User">The user name.</param>
/// <param name="Password">The password.</param>
/// <param name="ServerCertificateThumbprint">
/// The certificate of the server that accepted the user. The password goes to this certificate only: another
/// box at the same address with a certificate of its own does not get it. Null for a user stored before.
/// </param>
internal sealed record Credential(string User, string Password, string? ServerCertificateThumbprint = null)
{
    /// <summary>Whether the password may go to a server that presents <paramref name="thumbprint"/>.</summary>
    public bool Trusts(string? thumbprint) =>
        ServerCertificateThumbprint is not { Length: > 0 } pinned
        || string.Equals(pinned, thumbprint, StringComparison.OrdinalIgnoreCase);

    /// <summary>Never shows the password, also not in a log.</summary>
    public override string ToString() => $"Credential {{ User = {User} }}";
}

/// <summary>
/// The passwords of the OPC UA servers that want a user, one user per server, in
/// <c>secrets/credentials.json</c> below the data directory. A person enters them in a card of the chat;
/// the app sends them to the management API, never through the language model. The file is readable by
/// the adapter only; no answer of the adapter contains a password. A registration names the user, the
/// password stays here.
/// </summary>
internal sealed class CredentialStore
{
    private readonly string _file;
    private readonly Lock _gate = new();
    private readonly Action<string>? _onUnreadable;

    /// <summary>Creates the store below <paramref name="dataDirectory"/>.</summary>
    /// <param name="dataDirectory">The data directory of the adapter.</param>
    /// <param name="onUnreadable">Told why the file could not be read; it is then moved aside and the store is empty.</param>
    public CredentialStore(string dataDirectory, Action<string>? onUnreadable = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(dataDirectory);
        _onUnreadable = onUnreadable;
        var directory = Path.Combine(dataDirectory, "secrets");
        Directory.CreateDirectory(directory);
        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }

        _file = Path.Combine(directory, "credentials.json");
    }

    /// <summary>The user and password for the server at <paramref name="url"/>, or null if none is stored.</summary>
    public Credential? Find(string url)
    {
        lock (_gate)
        {
            return Read().GetValueOrDefault(EndpointKey.Normalize(url));
        }
    }

    /// <summary>The servers with a stored user, without the passwords.</summary>
    public IReadOnlyList<StoredUser> Users
    {
        get
        {
            lock (_gate)
            {
                return [.. Read().OrderBy(pair => pair.Key, StringComparer.Ordinal).Select(pair => new StoredUser(pair.Key, pair.Value.User))];
            }
        }
    }

    /// <summary>Stores the user and password for the server at <paramref name="url"/>, in place of one stored before.</summary>
    public void Save(string url, Credential credential)
    {
        ArgumentNullException.ThrowIfNull(credential);
        lock (_gate)
        {
            var all = Read();
            all[EndpointKey.Normalize(url)] = credential;
            Write(all);
        }
    }

    /// <summary>Forgets the user of the server at <paramref name="url"/>. Returns whether there was one.</summary>
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

    private Dictionary<string, Credential> Read()
    {
        if (!File.Exists(_file))
        {
            return new Dictionary<string, Credential>(StringComparer.Ordinal);
        }

        try
        {
            var read = JsonSerializer.Deserialize<Dictionary<string, Credential>>(AtomicFile.ReadAllText(_file), RegistrationJson.Options);
            return new Dictionary<string, Credential>(read ?? [], StringComparer.Ordinal);
        }
        catch (JsonException exception)
        {
            // A broken file must not take every request down, anonymous servers included. It is kept beside, so
            // a person can repair it, and the users of the servers are entered again.
            var aside = _file + ".unreadable";
            File.Move(_file, aside, overwrite: true);
            _onUnreadable?.Invoke($"{exception.Message} It is kept as {aside}; the users of the servers have to be entered again.");
            return new Dictionary<string, Credential>(StringComparer.Ordinal);
        }
    }

    // Readable by the adapter only.
    private void Write(Dictionary<string, Credential> all) =>
        AtomicFile.Write(_file, JsonSerializer.Serialize(all, RegistrationJson.Options), UnixFileMode.UserRead | UnixFileMode.UserWrite);
}
