using Microsoft.Extensions.Logging;

namespace Pleiades.Playground.Common.Logging;

public static class CallerInfoExtensions
{
    public static void LogTraceWithCallerInfo(
        this Microsoft.Extensions.Logging.ILogger logger,
        string message,
        object[] args,
        [System.Runtime.CompilerServices.CallerMemberName] string memberName = "",
        [System.Runtime.CompilerServices.CallerFilePath] string sourceFilePath = "",
        [System.Runtime.CompilerServices.CallerLineNumber] int sourceLineNumber = 0)
        => logger.LogWithCallerInfo(LogLevel.Trace, message, args, memberName, sourceFilePath, sourceLineNumber);

    public static void LogDebugWithCallerInfo(
        this Microsoft.Extensions.Logging.ILogger logger,
        string message,
        object[] args,
        [System.Runtime.CompilerServices.CallerMemberName] string memberName = "",
        [System.Runtime.CompilerServices.CallerFilePath] string sourceFilePath = "",
        [System.Runtime.CompilerServices.CallerLineNumber] int sourceLineNumber = 0)
        => logger.LogWithCallerInfo(LogLevel.Debug, message, args, memberName, sourceFilePath, sourceLineNumber);

    public static void LogInformationWithCallerInfo(
        this Microsoft.Extensions.Logging.ILogger logger,
        string message,
        object[] args,
        [System.Runtime.CompilerServices.CallerMemberName] string memberName = "",
        [System.Runtime.CompilerServices.CallerFilePath] string sourceFilePath = "",
        [System.Runtime.CompilerServices.CallerLineNumber] int sourceLineNumber = 0)
        => logger.LogWithCallerInfo(LogLevel.Information, message, args, memberName, sourceFilePath, sourceLineNumber);


    public static void LogWarningWithCallerInfo(
        this Microsoft.Extensions.Logging.ILogger logger,
        string message,
        object[] args,
        [System.Runtime.CompilerServices.CallerMemberName] string memberName = "",
        [System.Runtime.CompilerServices.CallerFilePath] string sourceFilePath = "",
        [System.Runtime.CompilerServices.CallerLineNumber] int sourceLineNumber = 0)
        => logger.LogWithCallerInfo(LogLevel.Warning, message, args, memberName, sourceFilePath, sourceLineNumber);

    public static void LogCriticalWithCallerInfo(
        this Microsoft.Extensions.Logging.ILogger logger,
        string message,
        object[] args,
        [System.Runtime.CompilerServices.CallerMemberName] string memberName = "",
        [System.Runtime.CompilerServices.CallerFilePath] string sourceFilePath = "",
        [System.Runtime.CompilerServices.CallerLineNumber] int sourceLineNumber = 0)
        => logger.LogWithCallerInfo(LogLevel.Critical, message, args, memberName, sourceFilePath, sourceLineNumber);

    public static void LogErrorWithCallerInfo(
        this Microsoft.Extensions.Logging.ILogger logger,
        string message,
        object[] args,
        [System.Runtime.CompilerServices.CallerMemberName] string memberName = "",
        [System.Runtime.CompilerServices.CallerFilePath] string sourceFilePath = "",
        [System.Runtime.CompilerServices.CallerLineNumber] int sourceLineNumber = 0)
        => logger.LogWithCallerInfo(LogLevel.Error, message, args, memberName, sourceFilePath, sourceLineNumber);

    private static void LogWithCallerInfo(
        this Microsoft.Extensions.Logging.ILogger logger,
        LogLevel logLevel,
        string message,
        object[] args,
        string memberName,
        string sourceFilePath,
        int sourceLineNumber)
    {
        ArgumentNullException.ThrowIfNull(logger);

        // Add caller info as a logging scope so it appears as structured properties
        using (logger.BeginScope(new Dictionary<string, object>
        {
            ["CallerMemberName"] = memberName,
            ["CallerFilePath"] = sourceFilePath,
            ["CallerLineNumber"] = sourceLineNumber
        }))
        {
#pragma warning disable CA2254 // Template should be static expression
#pragma warning disable CA1848 // Use LoggerMessage delegates
            logger.Log(logLevel, message, args);
#pragma warning restore CA1848 // Use LoggerMessage delegates
#pragma warning restore CA2254 // Template should be static expression
        }
    }
}

