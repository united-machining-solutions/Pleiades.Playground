using Pleiades.Playground.Bend.Simulator.Processing;

namespace Pleiades.Playground.Bend.Simulator;

// The JSON shapes the web page (wwwroot) reads and sends. Their property names are its contract.

/// <summary>Why a command of the web page failed.</summary>
internal enum CommandError
{
    None,
    NotFound,
    MachineBusy,
    InvalidInput,
    NothingToProcess,
}

/// <summary>
/// Outcome of a command of the web page. Expected failures (unknown package, machine busy, invalid input) come as
/// this result instead of an exception.
/// </summary>
internal sealed record CommandResult(bool IsSuccess, CommandError Error, string Message)
{
    public static CommandResult Success(string message) => new(true, CommandError.None, message);

    public static CommandResult Failure(CommandError error, string message) => new(false, error, message);
}

/// <summary>The machine as configured. Identity, exchange folder and file name are read only.</summary>
/// <param name="MachineDirectory">The exchange folder as the simulator sees it, <c>/exchange</c> in the container.</param>
/// <param name="TransferDirectorySource">What the exchange folder is mounted from; null if not configured.</param>
/// <param name="OutputFile">The name of the telegram files without the running number.</param>
internal sealed record MachineInfoDto(
    string Manufacturer,
    string Model,
    string SerialNumber,
    string ProductInstanceUri,
    string MachineDirectory,
    string? TransferDirectorySource,
    string OutputFile,
    bool IsBusy);

internal sealed record ProductionPackageDto(
    string Name,
    int DesiredQuantity,
    int ProcessedQuantity,
    string? ReportedBy,
    IReadOnlyList<ProductionPackagePositionDto> Positions);

/// <param name="ProcessedParts">-1 when the position was never reported.</param>
internal sealed record ProductionPackagePositionDto(
    string OrderNo,
    string PartNo,
    int DesiredNumberOfParts,
    int ProcessedParts,
    string Status);

internal sealed record CreateProductionPackagePositionRequest(string OrderNo, string PartNo, int DesiredNumberOfParts);

internal sealed record CreateProductionPackageRequest(
    string PackageName,
    int DesiredQuantity,
    IReadOnlyList<CreateProductionPackagePositionRequest> Positions);

internal sealed record GenerateDatasetRequest(
    int PackageCount,
    int PositionsPerPackage,
    int MinimumPartsPerPosition,
    int MaximumPartsPerPosition,
    string? NamePrefix);

/// <param name="OrderNo">The position to process; empty processes every open position of the package.</param>
/// <param name="ReportedBy">The operator, reported with the package feedback.</param>
internal sealed record StartAutomaticProcessingRequest(string PackageName, string? OrderNo, string? ReportedBy);

/// <summary>The operating states the web page reports by hand (MDE).</summary>
internal enum OperatingStateCommand
{
    Running,
    Idle,
    Maintenance,
    Error,
}

/// <param name="ErrorNo">Only for <see cref="OperatingStateCommand.Error"/>.</param>
/// <param name="ErrorText">Only for <see cref="OperatingStateCommand.Error"/>.</param>
internal sealed record SendOperatingStateRequest(OperatingStateCommand OperatingState, string? ErrorNo, string? ErrorText);

internal sealed record AutomaticProcessingStatusDto(
    AutomaticProcessingState State,
    string? ProductionPackageName,
    string? CurrentOrderNo,
    int CurrentPositionNumber,
    int PositionCount,
    int ProcessedParts,
    int DesiredParts,
    int SentPartFeedbacks,
    DateTime? StartedAt,
    DateTime? FinishedAt,
    string Message)
{
    public static AutomaticProcessingStatusDto Idle() =>
        new(AutomaticProcessingState.Idle, null, null, 0, 0, 0, 0, 0, null, null, string.Empty);
}

internal sealed record TelegramLogEntryDto(
    DateTime Timestamp,
    string Direction,
    string Channel,
    string MachineName,
    string Action,
    string Context);
