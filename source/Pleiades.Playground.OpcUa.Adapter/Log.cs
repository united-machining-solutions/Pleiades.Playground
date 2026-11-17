namespace Pleiades.Playground.OpcUa.Adapter;

/// <summary>The log messages of the adapter.</summary>
internal static partial class Log
{
    [LoggerMessage(1, LogLevel.Information, "Machine {SerialNumber} connected to {Url} with {SecurityMode} and {SecurityPolicy}.")]
    public static partial void MachineConnected(this ILogger logger, string serialNumber, string url, string securityMode, string securityPolicy);

    [LoggerMessage(2, LogLevel.Warning, "Machine {SerialNumber}: the session was lost. Connecting again.")]
    public static partial void MachineSessionLost(this ILogger logger, string serialNumber);

    [LoggerMessage(4, LogLevel.Warning, "Machine {SerialNumber}: element {Path} is not monitored, node {Node}: {Reason}. The server may have changed: scan it again.")]
    public static partial void ElementNotMonitored(this ILogger logger, string serialNumber, string path, string node, string reason);

    [LoggerMessage(5, LogLevel.Warning, "Machine {SerialNumber}: alarms are not monitored: {Reason}")]
    public static partial void AlertsNotMonitored(this ILogger logger, string serialNumber, string reason);

    [LoggerMessage(6, LogLevel.Debug, "Machine {SerialNumber}: closing the session failed: {Reason}")]
    public static partial void SessionCloseFailed(this ILogger logger, string serialNumber, string reason);

    [LoggerMessage(7, LogLevel.Warning, "Machine {SerialNumber}: publishing failed: {Reason}")]
    public static partial void PublishFailed(this ILogger logger, string serialNumber, string reason);

    [LoggerMessage(8, LogLevel.Information, "Machine {SerialNumber} registered with {Elements} elements, profiles {Profiles}.")]
    public static partial void MachineRegistered(this ILogger logger, string serialNumber, int elements, string profiles);

    [LoggerMessage(9, LogLevel.Information, "Machine {SerialNumber} removed.")]
    public static partial void MachineRemoved(this ILogger logger, string serialNumber);

    [LoggerMessage(10, LogLevel.Information, "{Count} registered machines loaded from {Directory}.")]
    public static partial void RegistrationsLoaded(this ILogger logger, int count, string directory);

    [LoggerMessage(11, LogLevel.Error, "The registration {File} cannot be read and is skipped: {Reason}")]
    public static partial void RegistrationUnreadable(this ILogger logger, string file, string reason);

    [LoggerMessage(12, LogLevel.Error, "Machine {SerialNumber}: the connection stopped unexpectedly: {Reason}")]
    public static partial void MachineStopped(this ILogger logger, string serialNumber, string reason);

    [LoggerMessage(13, LogLevel.Information, "Session to {Url} opened for {Machines} machines.")]
    public static partial void EndpointSessionOpened(this ILogger logger, string url, int machines);

    [LoggerMessage(14, LogLevel.Warning, "Session to {Url} lost. Connecting again.")]
    public static partial void EndpointSessionLost(this ILogger logger, string url);

    [LoggerMessage(15, LogLevel.Warning, "Session to {Url}: connect failed: {Reason} Next attempt in {Seconds} s.")]
    public static partial void EndpointConnectFailed(this ILogger logger, string url, string reason, double seconds);

    [LoggerMessage(16, LogLevel.Information, "Session to {Url} closed.")]
    public static partial void EndpointSessionClosed(this ILogger logger, string url);

    [LoggerMessage(17, LogLevel.Warning, "Machine {SerialNumber} could not be run on the session to {Url}: {Reason} It is tried again while the session stands.")]
    public static partial void MachineAttachFailed(this ILogger logger, string serialNumber, string url, string reason);
}
