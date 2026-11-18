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

    [LoggerMessage(8, LogLevel.Information, "Machine {SerialNumber} registered as {MachineId} with {Elements} elements, profiles {Profiles}.")]
    public static partial void MachineRegistered(this ILogger logger, string serialNumber, string machineId, int elements, string profiles);

    [LoggerMessage(9, LogLevel.Information, "Machine {SerialNumber} removed.")]
    public static partial void MachineRemoved(this ILogger logger, string serialNumber);

    [LoggerMessage(26, LogLevel.Warning, "Machine {SerialNumber} not removed: the broker cannot be reached, so its retained messages cannot be taken back.")]
    public static partial void MachineNotRemoved(this ILogger logger, string serialNumber);

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

    [LoggerMessage(18, LogLevel.Information, "A user {User} is stored for {Url}.")]
    public static partial void UserStored(this ILogger logger, string url, string user);

    [LoggerMessage(19, LogLevel.Information, "The user of {Url} is removed.")]
    public static partial void UserRemoved(this ILogger logger, string url);

    [LoggerMessage(20, LogLevel.Warning, "Machine {SerialNumber}: ConditionRefresh failed: {Reason}. New alarms are monitored; alarms that already stand are not caught up.")]
    public static partial void AlertsNotRefreshed(this ILogger logger, string serialNumber, string reason);



    [LoggerMessage(23, LogLevel.Information, "Machine {SerialNumber} is identified by its first values as {MachineId}; the identity is kept with its registration.")]
    public static partial void MachineIdentified(this ILogger logger, string serialNumber, string machineId);

    [LoggerMessage(24, LogLevel.Warning, "A second registration of machine {SerialNumber} ({MachineId}) is skipped: the first one runs. Remove the file that is not wanted from the data directory.")]
    public static partial void RegistrationDuplicate(this ILogger logger, string serialNumber, string machineId);

    [LoggerMessage(25, LogLevel.Error, "The stored users of the OPC UA servers cannot be read: {Reason}")]
    public static partial void CredentialsUnreadable(this ILogger logger, string reason);
}
