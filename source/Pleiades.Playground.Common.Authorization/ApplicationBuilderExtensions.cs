using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Pleiades.Playground.Common.Authorization;

/// <summary>Pipeline wiring for Pleiades backend authorization.</summary>
public static class ApplicationBuilderExtensions
{
    private static readonly Action<ILogger, Exception?> LogAuthDisabled =
        LoggerMessage.Define(LogLevel.Warning, new EventId(1, nameof(LogAuthDisabled)),
            "Authentication is DISABLED — all endpoints are anonymous. Permitted only outside Production.");

    /// <summary>
    /// Adds authentication + authorization to the pipeline and logs a prominent
    /// warning when authentication is disabled.
    /// </summary>
    public static WebApplication UsePleiadesAuth(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        var options = app.Services.GetService<AuthOptions>();
        if (options is { Enabled: false })
        {
            LogAuthDisabled(app.Logger, null);
        }

        app.UseAuthentication();
        app.UseAuthorization();
        return app;
    }
}
