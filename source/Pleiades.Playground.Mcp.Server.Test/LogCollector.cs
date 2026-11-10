using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace Pleiades.Playground.Mcp.Server.Test;

/// <summary>Collects the warnings one logger category writes, so a test can assert on what a host logged.</summary>
internal sealed class LogCollector(string category) : ILoggerProvider
{
    private readonly ConcurrentQueue<string> _warnings = new();

    internal IReadOnlyList<string> Warnings => [.. _warnings];

    public ILogger CreateLogger(string categoryName) =>
        string.Equals(categoryName, category, StringComparison.Ordinal) ? new WarningLogger(_warnings) : NullLogger.Instance;

    public void Dispose()
    {
    }

    private sealed class WarningLogger(ConcurrentQueue<string> warnings) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel == LogLevel.Warning;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (IsEnabled(logLevel))
            {
                warnings.Enqueue(formatter(state, exception));
            }
        }
    }
}
