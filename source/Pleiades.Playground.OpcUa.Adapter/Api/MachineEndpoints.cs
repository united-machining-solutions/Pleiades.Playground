using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Api;

/// <summary>One machine: its registration and what it does now.</summary>
internal sealed record MachineDetail(MachineRegistration Registration, MachineStatus Status);

/// <summary>
/// The management API of the adapter: which machines are added, checking a registration, adding and
/// removing a machine. Adding and removing are here and not among the MCP tools on purpose: a
/// language model proposes, a person decides.
/// </summary>
internal static class MachineEndpoints
{
    public static void MapMachineEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/endpoints", RankEndpoints);
        app.MapGet("/machines", List);
        app.MapGet("/machines/{serialNumber}", Show);
        app.MapGet("/machines/{serialNumber}/mapping", Mapping);
        app.MapPut("/machines/{serialNumber}", Register);
        app.MapDelete("/machines/{serialNumber}", Remove);
        app.MapPost("/drafts/{draftId}/commit", Commit);
    }

    /// <summary>Whether an exception says that the OPC UA server, not the request, is the problem.</summary>
    public static bool IsServerFault(Exception exception) =>
        exception is Opc.Ua.ServiceResultException or EndpointNotOfferedException or ServerCertificateChangedException
            or TimeoutException or System.Net.Sockets.SocketException or InvalidOperationException;

    /// <summary>The endpoints a server offers, strongest first. The first one is the one to register.</summary>
    private static async Task<IResult> RankEndpoints([FromQuery] string url, MachineSupervisor supervisor, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != "opc.tcp")
        {
            return Problem(StatusCodes.Status400BadRequest, ["url: must be an opc.tcp:// URL."]);
        }

        try
        {
            return Json(Views.Ranking(url, await supervisor.RankEndpointsAsync(url, cancellationToken).ConfigureAwait(false)));
        }
        catch (Exception exception) when (IsServerFault(exception))
        {
            return Problem(StatusCodes.Status502BadGateway, [$"The server at {url} did not answer: {exception.Message}"]);
        }
    }

    private static IResult List(MachineSupervisor supervisor) =>
        Json(new ServerListView([.. supervisor.Machines.Select(Views.Server)]));

    private static IResult Show(string serialNumber, MachineSupervisor supervisor) =>
        supervisor.Find(serialNumber) is { } connection
            ? Json(new MachineDetail(connection.Registration, connection.Status))
            : NotAdded(serialNumber);

    private static IResult Mapping(string serialNumber, MachineSupervisor supervisor) =>
        supervisor.Find(serialNumber) is { } connection ? Json(Views.Mapping(connection)) : NotAdded(serialNumber);

    /// <summary>
    /// Registers a machine, or replaces its registration. With <c>?dryRun=true</c> the registration is
    /// only tried against the server: nothing is stored, nothing is published.
    /// </summary>
    private static async Task<IResult> Register(
        string serialNumber,
        [FromBody] MachineRegistration registration,
        [FromQuery] bool? dryRun,
        MachineSupervisor supervisor,
        CancellationToken cancellationToken)
    {
        if (!string.Equals(serialNumber, registration.SerialNumber, StringComparison.Ordinal))
        {
            return Problem(StatusCodes.Status400BadRequest, ["serialNumber: the one in the address and the one in the registration differ."]);
        }

        try
        {
            return Outcome(await supervisor.RegisterAsync(registration, dryRun == true, cancellationToken).ConfigureAwait(false));
        }
        catch (Exception exception) when (IsServerFault(exception))
        {
            return Problem(StatusCodes.Status502BadGateway, [$"The server at {registration.Endpoint.Url} could not be used: {exception.Message}"]);
        }
    }

    /// <summary>
    /// Adds the machine of a proposal: the yes of a person to what a scan proposed. The registration
    /// is tried against the server once more, because the server may have changed since.
    /// </summary>
    private static async Task<IResult> Commit(string draftId, MachineSupervisor supervisor, CancellationToken cancellationToken)
    {
        try
        {
            return await supervisor.CommitAsync(draftId, cancellationToken).ConfigureAwait(false) is { } outcome
                ? Outcome(outcome)
                : Problem(StatusCodes.Status404NotFound, ["The proposal is gone: it was added already, or it is older than half an hour. Scan the server again."]);
        }
        catch (Exception exception) when (IsServerFault(exception))
        {
            return Problem(StatusCodes.Status502BadGateway, [$"The server could not be used: {exception.Message}"]);
        }
    }

    private static async Task<IResult> Remove(string serialNumber, MachineSupervisor supervisor, CancellationToken cancellationToken) =>
        await supervisor.RemoveAsync(serialNumber, cancellationToken).ConfigureAwait(false)
            ? Results.NoContent()
            : NotAdded(serialNumber);

    // A registration that does not fit its server is a conflict with the server, a malformed one a bad request.
    private static IResult Outcome(RegistrationOutcome outcome) =>
        outcome.Registered
            ? Json(outcome)
            : Results.Json(
                outcome,
                RegistrationJson.Options,
                statusCode: outcome.Endpoints is null ? StatusCodes.Status400BadRequest : StatusCodes.Status409Conflict);

    private static IResult NotAdded(string serialNumber) =>
        Problem(StatusCodes.Status404NotFound, [$"No machine {serialNumber} is added."]);

    private static IResult Json<T>(T value) => Results.Json(value, RegistrationJson.Options);

    private static IResult Problem(int status, IReadOnlyList<string> problems) =>
        Results.Json(new { problems }, RegistrationJson.Options, statusCode: status);
}
