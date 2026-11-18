using Microsoft.AspNetCore.Http.HttpResults;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.Common.Exceptions;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Endpoints;

/// <summary>
/// Provides endpoints that act on all values of one machine, the topics <c>machines/{machineId}/</c> of
/// the MQTT binding.
/// </summary>
internal static class Machines
{
    private static readonly Action<ILogger, string, long, Exception?> LogDeleted = LoggerMessage.Define<string, long>(LogLevel.Information, new EventId(1, nameof(LogDeleted)), "Deleted the values of machine '{MachineId}': {Count} data points");
    private static readonly Action<ILogger, string, Exception?> LogDeleteError = LoggerMessage.Define<string>(LogLevel.Error, new EventId(2, nameof(LogDeleteError)), "Error deleting the values of machine '{MachineId}'");

    /// <summary>
    /// Maps machine endpoints.
    /// </summary>
    public static RouteGroupBuilder MapMachines(this RouteGroupBuilder group)
    {
        group.MapDelete("/{machineId}", DeleteMachineValues)
            .WithName("DeleteMachineValues")
            .WithSummary("Deletes every stored value of one machine")
            .RequireFeatureWrite(TimeseriesFeature.Name);
        return group;
    }

    /// <summary>
    /// Why a serial number cannot name a machine, or <see langword="null"/>. It is one level of a topic:
    /// not empty, and without the separator and the wildcards of MQTT.
    /// </summary>
    internal static string? Validate(string machineId) =>
        string.IsNullOrWhiteSpace(machineId) || machineId.IndexOfAny(['/', '+', '#']) >= 0
            ? $"{nameof(machineId)} must be one level of a topic: not empty, without '/', '+' or '#'."
            : null;

    /// <summary>
    /// Deletes every data point of every topic below <c>machines/{machineId}/</c>, of base unit, string and
    /// boolean values. A machine that still reports has values again with its next message.
    /// </summary>
    /// <param name="machineId">The machine id, as in its topics. Example: alcyone-machines_AX-400_P-04</param>
    /// <param name="timeseriesDbService">Timeseries DB service.</param>
    /// <param name="loggerFactory">Logger factory.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>How many data points were deleted; zero if the machine had none.</returns>
    internal static async Task<Results<Ok<TimeseriesDeleteResultDto>, BadRequest<string>, StatusCodeHttpResult>> DeleteMachineValues(string machineId, ITimeseriesDbService timeseriesDbService, ILoggerFactory loggerFactory, CancellationToken cancellationToken)
    {
        var error = Validate(machineId);
        if (error is not null)
        {
            return TypedResults.BadRequest(error);
        }

        var logger = loggerFactory.CreateLogger(typeof(Machines));

        try
        {
            var result = await timeseriesDbService.DeleteByTopicPrefixAsync($"machines/{machineId}/", cancellationToken).ConfigureAwait(false);
            LogDeleted(logger, machineId, result.ValuesCount, null);
            return TypedResults.Ok(result);
        }
        catch (PleiadesWriteException ex)
        {
            LogDeleteError(logger, machineId, ex);
            return TypedResults.StatusCode(StatusCodes.Status500InternalServerError);
        }
    }
}
