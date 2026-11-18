using System.Collections.ObjectModel;
using System.ComponentModel.DataAnnotations;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Nats.Bridge;

/// <summary>
/// Configuration of the bridge: where it reads (MQTT), what it reads (topics) and where it writes (NATS).
/// </summary>
internal sealed class Config
{
    /// <summary>The MQTT broker of the stack, the source of every message.</summary>
    [Required]
    public required MqttConfig MqttSource { get; set; }

    /// <summary>
    /// The topic filters to bridge (wildcards allowed). A topic outside the binding of <c>machines/</c> and
    /// <c>sites/</c> is dropped, whatever the filter.
    /// </summary>
    [MinLength(1)]
    public Collection<string> Topics { get; } = [];

    /// <summary>
    /// Whether a retained message the broker hands over on subscribing is sent on as well. Every (re)connect
    /// brings the last value of every topic again; those CloudEvents carry the same <c>id</c> as before.
    /// </summary>
    public bool ForwardRetained { get; set; } = true;

    /// <summary>The NATS server the CloudEvents go to.</summary>
    [Required]
    public required NatsConfig Nats { get; set; }

    /// <summary>Loki logging configuration.</summary>
    [Required]
    public required SerilogLokiConfig Loki { get; init; }
}

/// <summary>
/// How the bridge reaches NATS and where it publishes. Defaults fit a NATS server on this computer whose
/// JetStream stream takes <c>local.&gt;</c>.
/// </summary>
internal sealed class NatsConfig
{
    /// <summary>The address of the server, for example <c>nats://localhost:4222</c>; several separated by commas.</summary>
    [System.Diagnostics.CodeAnalysis.SuppressMessage("Design", "CA1056:URI-like properties should not be strings", Justification = "NATS takes several addresses, separated by commas.")]
    public string Url { get; set; } = "nats://localhost:4222";

    /// <summary>The name of the connection, as the server shows it.</summary>
    public string ClientName { get; set; } = "pleiades-nats-bridge";

    /// <summary>
    /// The tokens every subject starts with, for example <c>local.pleiades</c>. The levels of the MQTT topic follow.
    /// </summary>
    public string SubjectPrefix { get; set; } = "local.pleiades";

    /// <summary>
    /// Publish through JetStream and wait for its acknowledgement (true), or publish plain core NATS without one
    /// (false). With JetStream a stream must take the subjects, see <see cref="CreateStream"/>.
    /// </summary>
    public bool JetStream { get; set; } = true;

    /// <summary>
    /// Create the stream <see cref="StreamName"/> with the subjects <c>{SubjectPrefix}.&gt;</c> before the first
    /// publish, when it is missing. A stream of that name that exists is left as it is. Leave it off where the server
    /// already has a stream for the subjects, such as <c>local.&gt;</c>.
    /// </summary>
    public bool CreateStream { get; set; }

    /// <summary>The stream created when <see cref="CreateStream"/> is set.</summary>
    public string StreamName { get; set; } = "pleiades";

    /// <summary>How long the stream created with <see cref="CreateStream"/> keeps a message.</summary>
    public TimeSpan StreamMaxAge { get; set; } = TimeSpan.FromDays(7);

    /// <summary>
    /// How often a publish is tried, while the connection stands, before the message is logged and dropped. While the
    /// connection is down no attempt is counted: the bridge waits.
    /// </summary>
    public int PublishAttempts { get; set; } = 5;

    /// <summary>The wait before the second attempt; it doubles with every further one, up to a minute.</summary>
    public TimeSpan RetryDelay { get; set; } = TimeSpan.FromSeconds(1);

    /// <summary>User name, with <see cref="Password"/>. Empty: none.</summary>
    public string User { get; set; } = string.Empty;

    /// <summary>Password of <see cref="User"/>.</summary>
    public string Password { get; set; } = string.Empty;

    /// <summary>A token instead of user and password. Empty: none.</summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>Path of a credentials file (JWT and NKey seed). Empty: none.</summary>
    public string CredsFile { get; set; } = string.Empty;

    /// <summary>Path of an NKey seed file. Empty: none.</summary>
    public string NKeyFile { get; set; } = string.Empty;

    /// <summary>TLS of the connection.</summary>
    public NatsTlsConfig Tls { get; set; } = new();
}

/// <summary>TLS of the connection to NATS. All paths are files inside the container.</summary>
internal sealed class NatsTlsConfig
{
    /// <summary>
    /// <c>Disable</c> (plain text, the default, as a broker on this computer takes it), <c>Auto</c> (TLS when the
    /// server or the address asks for it, or a certificate is given), <c>Prefer</c>, <c>Require</c> or <c>Implicit</c>.
    /// </summary>
    public string Mode { get; set; } = "Disable";

    /// <summary>Path of the client certificate (PEM). Empty: none.</summary>
    public string CertFile { get; set; } = string.Empty;

    /// <summary>Path of the private key of the client certificate (PEM). Empty: none.</summary>
    public string KeyFile { get; set; } = string.Empty;

    /// <summary>Path of the certificate authority to trust (PEM). Empty: the system's.</summary>
    public string CaFile { get; set; } = string.Empty;

    /// <summary>Accept any server certificate. For development only.</summary>
    public bool InsecureSkipVerify { get; set; }
}
