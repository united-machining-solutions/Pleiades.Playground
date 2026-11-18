using Microsoft.Extensions.Options;
using NATS.Client.Core;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace Pleiades.Playground.Nats.Bridge;

/// <summary>Sends a CloudEvent to NATS.</summary>
internal interface ICloudEventPublisher
{
    /// <summary>Whether the connection to NATS is open now.</summary>
    bool IsConnected { get; }

    /// <summary>Starts connecting, without waiting for it: a server that is not there yet is no reason not to start.</summary>
    void StartConnecting();

    /// <summary>Sends one CloudEvent; throws when it was not taken.</summary>
    Task PublishAsync(NatsCloudEvent cloudEvent, CancellationToken cancellationToken);
}

/// <summary>
/// Sends CloudEvents through JetStream, with its acknowledgement and <c>Nats-Msg-Id</c> for its duplicate window, or
/// plain core NATS. With <see cref="NatsConfig.CreateStream"/> it creates the stream before the first publish, when it
/// is missing; an existing stream it leaves as it is.
/// </summary>
internal sealed class NatsPublisher : ICloudEventPublisher, IDisposable
{
    private readonly INatsConnection _connection;
    private readonly NatsConfig _config;
    private readonly NatsJSContext? _jetStream;
    private readonly ILogger<NatsPublisher> _logger;
    private readonly SemaphoreSlim _streamGate = new(1, 1);
    private bool _streamReady;

    private static readonly Action<ILogger, string, string, Exception?> LogNotConnected = LoggerMessage.Define<string, string>(
        LogLevel.Warning, 0, "NATS {Url} not reached at the start, the connection keeps trying: {Error}");
    private static readonly Action<ILogger, string, string, Exception?> LogStreamCreated = LoggerMessage.Define<string, string>(
        LogLevel.Information, 1, "Stream {Stream} created for {Subjects}");

    public NatsPublisher(INatsConnection connection, IOptions<Config> config, ILogger<NatsPublisher> logger)
    {
        ArgumentNullException.ThrowIfNull(config);
        _connection = connection ?? throw new ArgumentNullException(nameof(connection));
        _config = config.Value.Nats;
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _jetStream = _config.JetStream ? new NatsJSContext(connection) : null;
        _streamReady = !_config.CreateStream;
    }

    public bool IsConnected => _connection.ConnectionState == NatsConnectionState.Open;

    public void StartConnecting()
    {
        // With RetryOnInitialConnect, ConnectAsync completes only once a connection stands; it takes no token. So it
        // runs on its own, and the health check and the worker look at the state of the connection.
        _ = ConnectAsync();
    }

    private async Task ConnectAsync()
    {
        try
        {
            await _connection.ConnectAsync().ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is NatsException or ObjectDisposedException)
        {
            LogNotConnected(_logger, _config.Url, ex.Message, null);
        }
    }

    public async Task PublishAsync(NatsCloudEvent cloudEvent, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(cloudEvent);
        var headers = new NatsHeaders { ["Content-Type"] = CloudEventMapper.NatsContentType };

        if (_jetStream is null)
        {
            await _connection.PublishAsync(cloudEvent.Subject, cloudEvent.Body, headers, cancellationToken: cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        await EnsureStreamAsync(_jetStream, cancellationToken).ConfigureAwait(false);
        var ack = await _jetStream.PublishAsync(cloudEvent.Subject, cloudEvent.Body, headers: headers,
            opts: new NatsJSPubOpts { MsgId = cloudEvent.MessageId }, cancellationToken: cancellationToken).ConfigureAwait(false);
        try
        {
            ack.EnsureSuccess();
        }
        catch (NatsJSDuplicateMessageException)
        {
            // The stream has this message already (same Nats-Msg-Id within its duplicate window): a retained value
            // handed over again after a restart, or an event the MQTT broker delivered twice. Stored is stored.
        }
    }

    public void Dispose() => _streamGate.Dispose();

    /// <summary>Creates the stream once, when it is configured and missing. A stream that exists is not changed.</summary>
    private async Task EnsureStreamAsync(NatsJSContext jetStream, CancellationToken cancellationToken)
    {
        if (_streamReady)
        {
            return;
        }
        await _streamGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_streamReady)
            {
                return;
            }
            try
            {
                await jetStream.GetStreamAsync(_config.StreamName, cancellationToken: cancellationToken).ConfigureAwait(false);
            }
            catch (NatsJSApiException ex) when (ex.Error.Code == 404)
            {
                var subjects = _config.SubjectPrefix + ".>";
                await jetStream.CreateStreamAsync(new StreamConfig(_config.StreamName, [subjects])
                {
                    MaxAge = _config.StreamMaxAge,
                    DuplicateWindow = TimeSpan.FromMinutes(2),
                }, cancellationToken).ConfigureAwait(false);
                LogStreamCreated(_logger, _config.StreamName, subjects, null);
            }
            _streamReady = true;
        }
        finally
        {
            _streamGate.Release();
        }
    }
}

/// <summary>Builds the options of the NATS connection from the configuration.</summary>
internal static class NatsOptionsFactory
{
    public static NatsOpts Create(NatsConfig config, ILoggerFactory loggerFactory)
    {
        ArgumentNullException.ThrowIfNull(config);
        return NatsOpts.Default with
        {
            Url = config.Url,
            Name = config.ClientName,
            LoggerFactory = loggerFactory,
            RetryOnInitialConnect = true,
            AuthOpts = NatsAuthOpts.Default with
            {
                Username = NullIfEmpty(config.User),
                Password = NullIfEmpty(config.Password),
                Token = NullIfEmpty(config.Token),
                CredsFile = NullIfEmpty(config.CredsFile),
                NKeyFile = NullIfEmpty(config.NKeyFile),
            },
            TlsOpts = NatsTlsOpts.Default with
            {
                Mode = Enum.Parse<TlsMode>(config.Tls.Mode, ignoreCase: true),
                CertFile = NullIfEmpty(config.Tls.CertFile),
                KeyFile = NullIfEmpty(config.Tls.KeyFile),
                CaFile = NullIfEmpty(config.Tls.CaFile),
                InsecureSkipVerify = config.Tls.InsecureSkipVerify,
            },
        };
    }

    private static string? NullIfEmpty(string value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
