using System.Text.RegularExpressions;

namespace Pleiades.Playground.Common.Logging.Configuration;

/// <summary>
/// Provides built-in redactors for common sensitive data types.
/// All redactors are thread-safe and immutable.
/// </summary>
public static partial class BuiltInRedactors
{
    /// <summary>
    /// Masks all characters with '***'.
    /// Example: "password123" → "***"
    /// </summary>
    public static IStringRedactor MaskAll { get; } = new MaskAllRedactor();

    /// <summary>
    /// Shows first 4 and last 4 characters, masks the middle.
    /// Example: "admin-user-1234" → "admi*******1234"
    /// </summary>
    public static IStringRedactor MaskPartial { get; } = new PartialRedactor(4, 4);

    /// <summary>
    /// Redacts MongoDB connection string credentials before '@'.
    /// Example: "mongodb://user:pass@host/db" → "mongodb://**********@host/db"
    /// </summary>
    public static IStringRedactor MongoConnectionString { get; } = new MongoConnectionStringRedactor();

    /// <summary>
    /// Redacts MQTT URI credentials before '@'.
    /// Example: "mqtt://user:pass@broker" → "mqtt://**********@broker"
    /// </summary>
    public static IStringRedactor MqttUri { get; } = new MqttUriRedactor();

    /// <summary>
    /// Redacts InfluxDB tokens - shows prefix, masks the rest.
    /// Example: "myToken_abc123def456" → "myToke***********456"
    /// </summary>
    public static IStringRedactor InfluxDbToken { get; } = MaskPartial;
    private sealed class MaskAllRedactor : IStringRedactor
    {
        public string? Redact(string? value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return value;
            }

            return "***";
        }
    }

    private sealed class PartialRedactor : IStringRedactor
    {
        private readonly int _prefixLength;
        private readonly int _suffixLength;

        public PartialRedactor(int prefixLength, int suffixLength)
        {
            ArgumentOutOfRangeException.ThrowIfNegative(prefixLength);
            ArgumentOutOfRangeException.ThrowIfNegative(suffixLength);

            _prefixLength = prefixLength;
            _suffixLength = suffixLength;
        }

        public string? Redact(string? value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return value;
            }

            if (value.Length <= _prefixLength + _suffixLength)
            {
                return new string('*', value.Length);
            }

            var prefix = value[.._prefixLength];
            var suffix = value[^_suffixLength..];

            return prefix + new string('*', 3) + suffix;
        }
    }

    private sealed partial class MongoConnectionStringRedactor : IStringRedactor
    {
        [GeneratedRegex(@"^(mongodb(?:\+srv)?://)([^@]+)@(.*)$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
        private static partial Regex CredentialsRegex();

        public string? Redact(string? value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return value;
            }

            return CredentialsRegex().Replace(value, m =>
            {
                var scheme = m.Groups[1].Value;
                var rest = m.Groups[3].Value;
                return $"{scheme}{new string('*', 10)}@{rest}";
            });
        }
    }

    private sealed partial class MqttUriRedactor : IStringRedactor
    {
        [GeneratedRegex(@"^(mqtts?://)([^@]+)@(.*)$", RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
        private static partial Regex CredentialsRegex();

        public string? Redact(string? value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return value;
            }

            return CredentialsRegex().Replace(value, m =>
            {
                var scheme = m.Groups[1].Value;
                var rest = m.Groups[3].Value;
                return $"{scheme}{new string('*', 10)}@{rest}";
            });
        }
    }
}
