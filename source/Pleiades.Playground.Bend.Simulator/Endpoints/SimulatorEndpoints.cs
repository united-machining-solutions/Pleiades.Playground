using System.Text.Json;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Bend.Simulator.Machine;
using Pleiades.Playground.Bend.Simulator.Processing;
using Pleiades.Playground.Bend.Simulator.ProductionPlan;

namespace Pleiades.Playground.Bend.Simulator.Endpoints;

/// <summary>
/// The backend of the web page, below <c>/api/simulator</c>. It is no public interface: the machine speaks to its
/// host only through the telegram files.
/// </summary>
internal static class SimulatorEndpoints
{
    private const int MaxPendingStreamEntries = 500;

    public static IEndpointRouteBuilder MapSimulatorEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/simulator");
        group.MapGet("/machine", GetMachine);
        group.MapGet("/production-plan", (ProductionPlanService plan) => Results.Ok(plan.GetProductionPlan()));
        group.MapPost("/production-packages", (CreateProductionPackageRequest request, ProductionPlanService plan) =>
            ToHttpResult(plan.AddProductionPackage(request)));
        group.MapPost("/production-packages/generate", (GenerateDatasetRequest request, ProductionPlanService plan) =>
            ToHttpResult(plan.GenerateDataset(request)));
        group.MapDelete("/production-packages/{packageName}", (string packageName, ProductionPlanService plan) =>
            ToHttpResult(plan.DeleteProductionPackage(packageName)));
        group.MapGet("/automatic-processing", (AutomaticProcessingService processing) => Results.Ok(processing.GetStatus()));
        group.MapPost("/automatic-processing", StartAutomaticProcessing);
        group.MapDelete("/automatic-processing", (AutomaticProcessingService processing) => ToHttpResult(processing.CancelProcessing()));
        group.MapPost("/operating-state", (SendOperatingStateRequest request, MachineDataService machineData) =>
            ToHttpResult(machineData.SendOperatingState(request)));

        var log = group.MapGroup("/communication-log");
        log.MapGet("/", (TelegramLog telegramLog) => Results.Ok(telegramLog.GetEntries().Select(ToDto).ToArray()));
        log.MapDelete("/", (TelegramLog telegramLog) =>
        {
            telegramLog.Clear();
            return Results.NoContent();
        });
        log.MapGet("/stream", StreamTelegramLogAsync);
        return endpoints;
    }

    private static IResult GetMachine(SimulatorRuntime runtime, MachineBusyState busyState)
    {
        var identity = runtime.Identity;
        var config = runtime.Config;
        return Results.Ok(new MachineInfoDto(
            identity.Manufacturer,
            identity.Model,
            identity.SerialNumber,
            identity.ProductInstanceUri,
            config.ExchangeDirectory,
            string.IsNullOrWhiteSpace(config.ExchangeDirectorySource) ? null : config.ExchangeDirectorySource,
            config.MachineFilePrefix,
            busyState.IsBusy));
    }

    private static IResult StartAutomaticProcessing(StartAutomaticProcessingRequest? request, AutomaticProcessingService processing)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.PackageName))
        {
            return Results.Problem("A package name is required.", statusCode: StatusCodes.Status400BadRequest);
        }

        return ToHttpResult(string.IsNullOrWhiteSpace(request.OrderNo)
            ? processing.StartPackageProcessing(request.PackageName, request.ReportedBy)
            : processing.StartPositionProcessing(request.PackageName, request.OrderNo, request.ReportedBy));
    }

    /// <summary>The live view of the telegram log, as server-sent events.</summary>
    private static async Task StreamTelegramLogAsync(HttpContext httpContext, TelegramLog telegramLog, IOptions<JsonOptions> jsonOptions)
    {
        var pending = Channel.CreateBounded<TelegramLogEntry>(new BoundedChannelOptions(MaxPendingStreamEntries)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
        });

        void Forward(object? sender, TelegramLogEntry entry) => pending.Writer.TryWrite(entry);

        httpContext.Response.Headers.ContentType = "text/event-stream";
        httpContext.Response.Headers.CacheControl = "no-cache";
        telegramLog.EntryAdded += Forward;
        try
        {
            await httpContext.Response.Body.FlushAsync(httpContext.RequestAborted).ConfigureAwait(false);
            await foreach (var entry in pending.Reader.ReadAllAsync(httpContext.RequestAborted).ConfigureAwait(false))
            {
                var json = JsonSerializer.Serialize(ToDto(entry), jsonOptions.Value.SerializerOptions);
                await httpContext.Response.WriteAsync($"data: {json}\n\n", httpContext.RequestAborted).ConfigureAwait(false);
                await httpContext.Response.Body.FlushAsync(httpContext.RequestAborted).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // The browser closed the connection.
        }
        finally
        {
            telegramLog.EntryAdded -= Forward;
        }
    }

    private static TelegramLogEntryDto ToDto(TelegramLogEntry entry) =>
        new(entry.Timestamp, "OUT", "RCI", entry.MachineName, entry.Action, entry.FileName);

    private static IResult ToHttpResult(CommandResult result)
    {
        if (result.IsSuccess)
        {
            return Results.Ok(new { message = result.Message });
        }

        var statusCode = result.Error switch
        {
            CommandError.NotFound => StatusCodes.Status404NotFound,
            CommandError.MachineBusy or CommandError.NothingToProcess => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest,
        };
        return Results.Problem(result.Message, statusCode: statusCode);
    }
}
