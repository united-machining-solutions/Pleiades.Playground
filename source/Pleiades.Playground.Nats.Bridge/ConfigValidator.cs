using Microsoft.Extensions.Options;
using NATS.Client.Core;

namespace Pleiades.Playground.Nats.Bridge;

/// <summary>
/// Checks what data annotations do not: they do not look into the nested sections, and some rules are no annotation.
/// </summary>
internal sealed class ConfigValidator : IValidateOptions<Config>
{
    public ValidateOptionsResult Validate(string? name, Config options)
    {
        ArgumentNullException.ThrowIfNull(options);
        var errors = Errors(options).ToList();
        return errors.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(errors);
    }

    internal static IEnumerable<string> Errors(Config config)
    {
        if (config.Nats is not { } nats)
        {
            yield return "Config:Nats is missing.";
            yield break;
        }
        if (string.IsNullOrWhiteSpace(nats.Url))
        {
            yield return "Config:Nats:Url is empty.";
        }
        if (!CloudEventMapper.IsValidPrefix(nats.SubjectPrefix ?? string.Empty))
        {
            yield return "Config:Nats:SubjectPrefix must be NATS tokens joined by dots, without wildcards or white space.";
        }
        if (nats.PublishAttempts < 1)
        {
            yield return "Config:Nats:PublishAttempts must be 1 or more.";
        }
        if (nats.RetryDelay < TimeSpan.Zero)
        {
            yield return "Config:Nats:RetryDelay must not be negative.";
        }
        if (nats.CreateStream && string.IsNullOrWhiteSpace(nats.StreamName))
        {
            yield return "Config:Nats:StreamName is empty, and CreateStream is set.";
        }
        if (nats.StreamMaxAge < TimeSpan.Zero)
        {
            yield return "Config:Nats:StreamMaxAge must not be negative.";
        }
        if (!Enum.TryParse<TlsMode>(nats.Tls?.Mode, ignoreCase: true, out _) || int.TryParse(nats.Tls?.Mode, out _))
        {
            yield return "Config:Nats:Tls:Mode must be Disable, Auto, Prefer, Require or Implicit.";
        }
        if (config.Topics.Count == 0)
        {
            yield return "Config:Topics names no topic.";
        }
    }
}
