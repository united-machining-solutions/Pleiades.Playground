using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Api;

/// <summary>One machine: its registration and what it does now.</summary>
internal sealed record MachineDetail(MachineRegistration Registration, MachineStatus Status);

/// <summary>A user name and a password a person entered for a server.</summary>
/// <param name="Url">The address of the server, <c>opc.tcp://host:port</c>.</param>
/// <param name="User">The user name.</param>
/// <param name="Password">The password. It is stored and never sent back.</param>
internal sealed record UserRequest(string Url, string User, string Password)
{
    /// <summary>Never shows the password, also not in a log.</summary>
    public override string ToString() => $"UserRequest {{ Url = {Url}, User = {User} }}";
}

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
        app.MapGet("/endpoints/machines", FindMachines);
        app.MapGet("/users", ListUsers);
        app.MapPut("/users", SaveUser);
        app.MapDelete("/users", RemoveUser);
        app.MapGet("/machines", List);
        app.MapGet("/machines/{serialNumber}", Show);
        app.MapGet("/machines/{serialNumber}/mapping", Mapping);
        app.MapPut("/machines/{serialNumber}", Register)
            .WithSummary("Registers a machine, or replaces its registration, and starts it")
            .WithDescription(RefusalDescription);
        app.MapDelete("/machines/{serialNumber}", Remove)
            .WithSummary("Removes a machine and takes its retained messages back from the broker")
            .WithDescription(
                "204 when removed; 404 if no such machine is added; 503 if the broker cannot be reached, so that the " +
                "retained messages of the machine cannot be taken back: the machine then stays added.");
        app.MapPost("/drafts/{draftId}/commit", Commit)
            .WithSummary("Registers what a proposal of the chat holds")
            .WithDescription(RefusalDescription);
    }

    private const string RefusalDescription =
        "A refused registration answers with its reasons in problems: 400 if it is malformed; 409 once the server " +
        "has answered, if the registration does not fit it, is not the machine it says it is, or if the server gives " +
        "no value for Identification.ManufacturerUri (or, if it has no node for it, Identification.Manufacturer), Model or SerialNumber, " +
        "the parts of the machine id (identity: ...); 502 if the server does not answer. A core the machine does not deliver whole is no reason: " +
        "what it lacks is declared not available.";

    /// <summary>Whether an exception says that the OPC UA server, not the request, is the problem.</summary>
    public static bool IsServerFault(Exception exception) =>
        exception is Opc.Ua.ServiceResultException or EndpointNotOfferedException or ServerCertificateChangedException or ServerCertificateRejectedException
            or CredentialMissingException or TimeoutException or System.Net.Sockets.SocketException or InvalidOperationException;

    /// <summary>The endpoints a server offers, strongest first. The first one is the one to register.</summary>
    private static async Task<IResult> RankEndpoints([FromQuery] string url, MachineSupervisor supervisor, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != "opc.tcp")
        {
            return Problem(StatusCodes.Status400BadRequest, ["url: must be an opc.tcp:// URL."]);
        }

        try
        {
            return Json(Views.Ranking(await supervisor.OfferAsync(url, cancellationToken).ConfigureAwait(false)));
        }
        catch (Exception exception) when (IsServerFault(exception))
        {
            return Problem(StatusCodes.Status502BadGateway, [$"The server at {url} did not answer: {exception.Message}"]);
        }
    }

    /// <summary>The machines a server serves: one, or several behind an aggregation server.</summary>
    private static async Task<IResult> FindMachines([FromQuery] string url, MachineSupervisor supervisor, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed) || parsed.Scheme != "opc.tcp")
        {
            return Problem(StatusCodes.Status400BadRequest, ["url: must be an opc.tcp:// URL."]);
        }

        try
        {
            return Json(Views.Machines(await supervisor.FindMachinesAsync(url, cancellationToken).ConfigureAwait(false), supervisor.Machines));
        }
        catch (Exception exception) when (IsServerFault(exception))
        {
            return Problem(StatusCodes.Status502BadGateway, [$"The server at {url} did not answer: {exception.Message}"]);
        }
    }

    /// <summary>The servers with a stored user, without the passwords.</summary>
    private static IResult ListUsers(MachineSupervisor supervisor) =>
        Json(new StoredUserListView([.. supervisor.Users.Select(user => new StoredUserView(user.Url, user.User))]));

    /// <summary>
    /// Stores the user and password a person entered for a server, after the server accepted them. The
    /// card of the chat sends this from the server of the app, never the language model.
    /// </summary>
    private static async Task<IResult> SaveUser([FromBody] UserRequest request, MachineSupervisor supervisor, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(request.Url, UriKind.Absolute, out var parsed) || parsed.Scheme != "opc.tcp")
        {
            return Problem(StatusCodes.Status400BadRequest, ["url: must be an opc.tcp:// URL."]);
        }

        if (string.IsNullOrWhiteSpace(request.User) || string.IsNullOrEmpty(request.Password))
        {
            return Problem(StatusCodes.Status400BadRequest, ["user and password: both are required."]);
        }

        try
        {
            return await supervisor.SaveUserAsync(request.Url, new Credential(request.User.Trim(), request.Password), cancellationToken).ConfigureAwait(false) is { } refused
                ? Problem(StatusCodes.Status409Conflict, [refused])
                : Results.NoContent();
        }
        catch (Exception exception) when (IsServerFault(exception))
        {
            return Problem(StatusCodes.Status502BadGateway, [$"The server at {request.Url} did not answer: {exception.Message}"]);
        }
    }

    /// <summary>Forgets the user of a server.</summary>
    private static IResult RemoveUser([FromQuery] string url, MachineSupervisor supervisor) =>
        supervisor.RemoveUser(url) ? Results.NoContent() : Problem(StatusCodes.Status404NotFound, [$"No user is stored for {url}."]);

    private static IResult List(MachineSupervisor supervisor) =>
        Json(new ServerListView([.. supervisor.Machines.Select(machine => Views.Server(machine, supervisor.SharingSession(machine)))]));

    private static IResult Show(string serialNumber, MachineSupervisor supervisor) =>
        supervisor.Find(serialNumber) is { } connection
            ? Json(new MachineDetail(connection.Registration, connection.Status))
            : NotAdded(serialNumber);

    private static IResult Mapping(string serialNumber, MachineSupervisor supervisor) =>
        supervisor.Find(serialNumber) is { } connection ? Json(Views.Mapping(connection, supervisor.SharingSession(connection))) : NotAdded(serialNumber);

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
        await supervisor.RemoveAsync(serialNumber, cancellationToken).ConfigureAwait(false) switch
        {
            MachineRemoval.Removed => Results.NoContent(),
            MachineRemoval.BrokerUnreachable => Problem(
                StatusCodes.Status503ServiceUnavailable,
                [$"The broker cannot be reached, so the retained messages of {serialNumber} cannot be taken back. The machine stays added; try again once the broker is back."]),
            _ => NotAdded(serialNumber),
        };

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
