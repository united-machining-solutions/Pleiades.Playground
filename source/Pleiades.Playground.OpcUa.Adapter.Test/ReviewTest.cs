using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Protocol;
using Moq;
using Opc.Ua;
using Opc.Ua.Client;
using Opc.Ua.Client.Discovery;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.McpTools;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

/// <summary>The filter of the scan's connect tool, as the MCP server runs it, with a stored user.</summary>
[TestClass]
public class ScanConnectFilterTest
{
    private const string Url = "opc.tcp://machine:4840";
    private const string Pinned = "AABBCC";

    public required TestContext TestContext { get; set; }

    private static CallToolRequestParams Call(string json) => new()
    {
        Name = ScanConnect.ToolName,
        Arguments = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!,
    };

    private static Func<string, CancellationToken, Task<IReadOnlyList<OfferedEndpoint>>> Presents(string? thumbprint) =>
        (_, _) => Task.FromResult<IReadOnlyList<OfferedEndpoint>>(
            [new OfferedEndpoint(Url, SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", false, thumbprint, UserName: true)]);

    private static readonly Credential Stored = new("operator", "s3cret-pass", Pinned);

    [TestMethod]
    public async Task A_scan_the_server_refuses_for_an_untrusted_adapter_says_how_to_trust_it()
    {
        var result = await ScanConnect.CallAsync(
            Call($$"""{"endpointUrl":"{{Url}}"}"""),
            _ => null,
            Presents(Pinned),
            (_, _) => ValueTask.FromResult(new CallToolResult
            {
                IsError = true,
                Content = [new TextContentBlock { Text = "Connect failed: [80130000] (BadSecurityChecksFailed)" }],
            }),
            TestContext.CancellationToken);

        Assert.IsTrue(result.IsError);
        var texts = result.Content.OfType<TextContentBlock>().Select(block => block.Text).ToList();
        Assert.HasCount(2, texts, "The error of the library stays, the hint comes after it.");
        Assert.Contains("does not trust the certificate of the adapter", texts[1]);
        Assert.Contains(Url, texts[1]);
        Assert.Contains(OpcUaClient.ApplicationName, texts[1]);
    }

    [TestMethod]
    public async Task Another_error_of_a_scan_gets_no_trust_hint()
    {
        var result = await ScanConnect.CallAsync(
            Call($$"""{"endpointUrl":"{{Url}}"}"""),
            _ => null,
            Presents(Pinned),
            (_, _) => ValueTask.FromResult(new CallToolResult
            {
                IsError = true,
                Content = [new TextContentBlock { Text = "Connect failed: [80AE0000] (BadNotConnected)" }],
            }),
            TestContext.CancellationToken);

        Assert.HasCount(1, result.Content);
    }

    [TestMethod]
    public async Task A_stored_user_goes_into_the_call_and_its_password_out_of_the_result()
    {
        CallToolRequestParams? passed = null;

        var result = await ScanConnect.CallAsync(
            Call($$"""{"endpointUrl":"{{Url}}"}"""),
            url => url == Url ? Stored : null,
            Presents(Pinned),
            (call, _) =>
            {
                passed = call;
                return ValueTask.FromResult(new CallToolResult { IsError = true, Content = [new TextContentBlock { Text = "Connect failed for operator/s3cret-pass" }] });
            },
            TestContext.CancellationToken);

        Assert.IsNotNull(passed);
        Assert.AreEqual("s3cret-pass", passed.Arguments!["password"].GetString());
        Assert.AreEqual("SignAndEncrypt", passed.Arguments["securityMode"].GetString());
        var text = ((TextContentBlock)result.Content[0]).Text;
        Assert.DoesNotContain("s3cret-pass", text, "The model never reads the password, also not in an error.");
        Assert.Contains("***", text);
    }

    [TestMethod]
    public async Task Another_certificate_at_the_address_does_not_get_the_password()
    {
        var called = false;

        var result = await ScanConnect.CallAsync(
            Call($$"""{"endpointUrl":"{{Url}}"}"""),
            _ => Stored,
            Presents("DDEEFF"),
            (_, _) =>
            {
                called = true;
                return ValueTask.FromResult(new CallToolResult());
            },
            TestContext.CancellationToken);

        Assert.IsFalse(called, "The tool is not called, so nothing connects with the password.");
        Assert.IsTrue(result.IsError);
        Assert.AreEqual(ScanConnect.CertificateRefusal, ((TextContentBlock)result.Content[0]).Text);
    }

    [TestMethod]
    public async Task A_call_that_brings_a_user_is_refused_and_one_without_a_stored_user_goes_on_as_it_is()
    {
        var refused = await ScanConnect.CallAsync(
            Call($$"""{"endpointUrl":"{{Url}}","username":"x","password":"y"}"""), _ => Stored, Presents(Pinned),
            (_, _) => throw new AssertFailedException("The tool must not be called."), TestContext.CancellationToken);
        Assert.AreEqual(ScanConnect.Refusal, ((TextContentBlock)refused.Content[0]).Text);

        CallToolRequestParams? passed = null;
        await ScanConnect.CallAsync(
            Call($$"""{"endpointUrl":"{{Url}}"}"""), _ => null, Presents(Pinned),
            (call, _) =>
            {
                passed = call;
                return ValueTask.FromResult(new CallToolResult());
            },
            TestContext.CancellationToken);
        Assert.IsFalse(passed!.Arguments!.ContainsKey("password"), "An anonymous scan stays anonymous.");
    }
}

/// <summary>The certificate a machine and a user are known by: nothing connects to another one.</summary>
[TestClass]
public class CertificatePinTest
{
    private const string Url = "opc.tcp://machine:4840";

    public required TestContext TestContext { get; set; }

    private static readonly byte[] Certificate = [1, 2, 3, 4];

#pragma warning disable CA5350 // The thumbprint of OPC UA is SHA-1, as the adapter computes it.
    private static readonly string Thumbprint = Convert.ToHexString(SHA1.HashData(Certificate));
#pragma warning restore CA5350

    private static OpcUaClient Client(CredentialStore credentials, Mock<IManagedSessionFactory> sessions)
    {
        var description = new EndpointDescription
        {
            EndpointUrl = Url,
            SecurityMode = MessageSecurityMode.SignAndEncrypt,
            SecurityPolicyUri = SecurityPolicies.Aes256_Sha256_RsaPss,
            ServerCertificate = ByteString.From(Certificate),
            UserIdentityTokens = new UserTokenPolicy[]
            {
                new() { TokenType = UserTokenType.Anonymous },
                new() { TokenType = UserTokenType.UserName },
            },
        };
        var discovery = new Mock<IOpcUaDiscoveryService>();
        discovery
            .Setup(service => service.GetEndpointsAsync(It.IsAny<string>(), It.IsAny<ArrayOf<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EndpointDescription[] { description });
        return new OpcUaClient(discovery.Object, sessions.Object, credentials);
    }

    private static EndpointRegistration Endpoint(string? pinned = null, string? user = null) => new()
    {
        Url = Url,
        SecurityMode = SecurityMode.SignAndEncrypt,
        SecurityPolicy = "Aes256_Sha256_RsaPss",
        ServerCertificateThumbprint = pinned,
        User = user,
    };

    [TestMethod]
    public async Task A_machine_does_not_connect_to_another_certificate_than_its_registration_names()
    {
        using var directory = new TemporaryDirectory();
        var sessions = new Mock<IManagedSessionFactory>(MockBehavior.Strict);
        var client = Client(new CredentialStore(directory.Path), sessions);

        await Assert.ThrowsExactlyAsync<ServerCertificateChangedException>(
            () => client.ConnectAsync(Endpoint(pinned: "0000"), TestContext.CancellationToken));
        sessions.VerifyNoOtherCalls();
    }

    [TestMethod]
    public async Task A_rejected_server_certificate_is_told_with_its_reason()
    {
        using var directory = new TemporaryDirectory();
        var sessions = new Mock<IManagedSessionFactory>(MockBehavior.Strict);
        sessions
            .Setup(factory => factory.ConnectAsync(It.IsAny<ConfiguredEndpoint>(), It.IsAny<Action<ManagedSessionBuilder>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new ServiceResultException(
                StatusCodes.BadCertificateUriInvalid,
                new LocalizedText("The Application in the EndpointDescription (urn:UmatiSampleServer) is not in the Server Certificate.")));
        var client = Client(new CredentialStore(directory.Path), sessions);

        var rejected = await Assert.ThrowsExactlyAsync<ServerCertificateRejectedException>(
            () => client.ConnectAsync(Endpoint(), TestContext.CancellationToken));

        Assert.Contains("BadCertificateUriInvalid", rejected.Message);
        Assert.Contains("urn:UmatiSampleServer", rejected.Message);
        Assert.Contains(Url, rejected.Message);
        Assert.IsTrue(Api.MachineEndpoints.IsServerFault(rejected), "The chat and the API tell it as a fault of the server.");
    }

    [TestMethod]
    public async Task A_server_that_does_not_trust_the_adapter_is_told_with_how_to_trust_it()
    {
        using var directory = new TemporaryDirectory();
        var sessions = new Mock<IManagedSessionFactory>(MockBehavior.Strict);
        sessions
            .Setup(factory => factory.ConnectAsync(It.IsAny<ConfiguredEndpoint>(), It.IsAny<Action<ManagedSessionBuilder>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new ServiceResultException(StatusCodes.BadSecurityChecksFailed, "Error received from remote host"));
        var client = Client(new CredentialStore(directory.Path), sessions);

        var rejected = await Assert.ThrowsExactlyAsync<ServerCertificateRejectedException>(
            () => client.ConnectAsync(Endpoint(), TestContext.CancellationToken));

        Assert.Contains(Url, rejected.Message);
        Assert.Contains("BadSecurityChecksFailed", rejected.Message);
        Assert.Contains("does not trust the certificate of the adapter", rejected.Message);
        Assert.Contains(OpcUaClient.ApplicationName, rejected.Message, "The person finds the certificate by the name the server shows.");
        Assert.Contains("trusted", rejected.Message);
    }

    [TestMethod]
    public async Task A_session_without_a_user_ends_at_once_when_the_server_refuses_the_adapter()
    {
        using var directory = new TemporaryDirectory();
        var configure = await ConfigurationOf(new CredentialStore(directory.Path), Endpoint());

        var (refused, tries) = await ConnectToRefusingServer(configure, StatusCodes.BadSecurityChecksFailed);

        Assert.AreEqual(StatusCodes.BadSecurityChecksFailed, refused.StatusCode);
        Assert.HasCount(1, tries, "The stack does not try again: the reason reaches the person, not a timeout.");
    }

    [TestMethod]
    public async Task A_session_with_a_user_ends_at_once_when_the_server_refuses_the_user()
    {
        using var directory = new TemporaryDirectory();
        var credentials = new CredentialStore(directory.Path);
        credentials.Save(Url, new Credential("operator", "s3cret-pass", Thumbprint));
        var configure = await ConfigurationOf(credentials, Endpoint(user: "operator"));

        var (refused, tries) = await ConnectToRefusingServer(configure, StatusCodes.BadUserAccessDenied);

        Assert.AreEqual(StatusCodes.BadUserAccessDenied, refused.StatusCode);
        Assert.HasCount(1, tries, "The stack does not try again: the reason reaches the person, not a timeout.");
        Assert.AreEqual(UserTokenType.UserName, tries[0]?.TokenType, "The session logs in with the stored user.");
    }

    /// <summary>The configuration the client gives the session factory of the stack for a connect to <paramref name="endpoint"/>.</summary>
    private async Task<Action<ManagedSessionBuilder>> ConfigurationOf(CredentialStore credentials, EndpointRegistration endpoint)
    {
        Action<ManagedSessionBuilder>? configure = null;
        var sessions = new Mock<IManagedSessionFactory>(MockBehavior.Strict);
        sessions
            .Setup(factory => factory.ConnectAsync(It.IsAny<ConfiguredEndpoint>(), It.IsAny<Action<ManagedSessionBuilder>>(), It.IsAny<CancellationToken>()))
            .Callback<ConfiguredEndpoint, Action<ManagedSessionBuilder>, CancellationToken>((_, action, _) => configure = action)
            .ThrowsAsync(new ServiceResultException(StatusCodes.BadNotConnected));

        await Assert.ThrowsExactlyAsync<ServiceResultException>(
            () => Client(credentials, sessions).ConnectAsync(endpoint, TestContext.CancellationToken));

        Assert.IsNotNull(configure, "The client opens the session through the factory.");
        return configure;
    }

    /// <summary>
    /// Connects a real managed session of the stack, configured by <paramref name="configure"/>, to a server that
    /// refuses every session with <paramref name="status"/>. Without the reconnect policy of the adapter the stack
    /// tries again until it is cancelled; the limit only keeps such a test from hanging.
    /// </summary>
    /// <returns>The refusal the connect ended with, and the user identity of each try.</returns>
    private async Task<(ServiceResultException Refused, List<IUserIdentity?> Tries)> ConnectToRefusingServer(
        Action<ManagedSessionBuilder> configure, StatusCode status)
    {
        var telemetry = DefaultTelemetry.Create(_ => { });
        var tries = new List<IUserIdentity?>();
        var server = new Mock<ISessionFactory>();
        server.SetupGet(factory => factory.Telemetry).Returns(telemetry);
        server
            .Setup(factory => factory.WithSubscriptionEngine(It.IsAny<ISubscriptionEngineFactory>(), It.IsAny<TimeProvider>()))
            .Returns(() => server.Object);
        server
            .Setup(factory => factory.CreateAsync(
                It.IsAny<ApplicationConfiguration>(), It.IsAny<ConfiguredEndpoint>(), It.IsAny<bool>(), It.IsAny<bool>(),
                It.IsAny<string>(), It.IsAny<uint>(), It.IsAny<IUserIdentity>(), It.IsAny<ArrayOf<string>>(), It.IsAny<CancellationToken>()))
            .Callback((ApplicationConfiguration _, ConfiguredEndpoint _, bool _, bool _, string _, uint _, IUserIdentity? identity, ArrayOf<string> _, CancellationToken _) =>
                tries.Add(identity))
            .ThrowsAsync(new ServiceResultException(status));
        var builder = new ManagedSessionBuilder(new ApplicationConfiguration(), telemetry)
            .UseEndpoint(new ConfiguredEndpoint(null, new EndpointDescription { EndpointUrl = Url }, null))
            .UseSessionFactory(server.Object);
        configure(builder);

        using var limited = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        limited.CancelAfter(TimeSpan.FromSeconds(10));
        var refused = await Assert.ThrowsExactlyAsync<ServiceResultException>(
            async () =>
            {
                await using var session = await builder.ConnectAsync(limited.Token);
            },
            "The connect ends with the refusal of the server, not when it is cancelled.");
        return (refused, tries);
    }

    [TestMethod]
    public async Task A_password_goes_only_to_the_certificate_its_user_was_stored_with()
    {
        using var directory = new TemporaryDirectory();
        var credentials = new CredentialStore(directory.Path);
        credentials.Save(Url, new Credential("operator", "s3cret-pass", "0000"));
        var sessions = new Mock<IManagedSessionFactory>(MockBehavior.Strict);
        var client = Client(credentials, sessions);

        var refused = await Assert.ThrowsExactlyAsync<ServerCertificateChangedException>(
            () => client.ConnectAsync(Endpoint(user: "operator"), TestContext.CancellationToken));

        Assert.DoesNotContain("s3cret-pass", refused.Message);
        sessions.VerifyNoOtherCalls();
        Assert.IsTrue(new Credential("operator", "x", Thumbprint).Trusts(Thumbprint.ToLowerInvariant()), "A thumbprint is compared without its case.");
        Assert.IsTrue(new Credential("operator", "x").Trusts("anything"), "A user stored before the pin is trusted as it was.");
    }

    [TestMethod]
    public void A_file_of_users_that_cannot_be_read_is_kept_aside_and_the_store_goes_on_empty()
    {
        using var directory = new TemporaryDirectory();
        var file = Path.Combine(directory.Path, "secrets", "credentials.json");
        string? told = null;
        var credentials = new CredentialStore(directory.Path, reason => told = reason);
        File.WriteAllText(file, "{ not json");

        Assert.IsNull(credentials.Find(Url));
        Assert.IsEmpty(credentials.Users);
        Assert.IsNotNull(told);
        Assert.IsTrue(File.Exists(file + ".unreadable"), "The file is kept for a person to repair.");
    }
}

/// <summary>The supervisor adds, stops and removes machines, each with its output.</summary>
[TestClass]
public class MachineSupervisorTest
{
    public required TestContext TestContext { get; set; }

    private static MachineRegistration Registration(string serialNumber, string machineId) => new()
    {
        SerialNumber = serialNumber,
        Endpoint = new EndpointRegistration { Url = "opc.tcp://unreachable:4840", SecurityMode = SecurityMode.SignAndEncrypt },
        Identity = new IdentityRegistration
        {
            Manufacturer = "TRUMPF",
            ManufacturerUri = "https://www.trumpf.com",
            Model = "TruMatic",
            ProductInstanceUri = $"urn:{serialNumber}",
            MachineId = machineId,
        },
    };

    private static (MachineSupervisor Supervisor, FakeOutputs Outputs) Supervisor(string dataDirectory)
    {
        var credentials = new CredentialStore(dataDirectory);
        // The server answers no discovery: every session fails and tries again, as a machine that is off does.
        var discovery = new Mock<IOpcUaDiscoveryService>();
        discovery
            .Setup(service => service.GetEndpointsAsync(It.IsAny<string>(), It.IsAny<ArrayOf<string>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new ServiceResultException(StatusCodes.BadNotConnected));
        var client = new OpcUaClient(discovery.Object, new Mock<IManagedSessionFactory>(MockBehavior.Strict).Object, credentials);
        var outputs = new FakeOutputs();
        var config = Options.Create(new Config
        {
            MqttDestination = new MqttConfig { ConnectionString = "mqtt://broker:1883" },
            Loki = new SerilogLokiConfig { Sinks = [] },
            DataDirectory = dataDirectory,
        });
        var supervisor = new MachineSupervisor(
            new RegistrationStore(dataDirectory), new AlertStore(dataDirectory), client, new RegistrationProbe(client), outputs,
            new DraftStore(), credentials, config, NullLogger<MachineSupervisor>.Instance);
        return (supervisor, outputs);
    }

    private async Task Started(MachineSupervisor supervisor, int machines)
    {
        await supervisor.StartAsync(TestContext.CancellationToken);
        for (var waited = 0; supervisor.Machines.Count < machines && waited < 100; waited++)
        {
            await Task.Delay(50, TestContext.CancellationToken);
        }

        Assert.HasCount(machines, supervisor.Machines);
    }

    [TestMethod]
    public async Task A_second_file_of_one_machine_is_skipped_at_the_start()
    {
        using var directory = new TemporaryDirectory();
        var store = new RegistrationStore(directory.Path);
        store.Save(Registration("A1121O0001", "trumpf_TruMatic_A1121O0001"));
        // A copy under another name, as a person might bring it from another adapter.
        var machines = Path.Combine(directory.Path, "machines");
        File.Copy(Path.Combine(machines, "A1121O0001.json"), Path.Combine(machines, "copy-of-A1121O0001.json"));
        var (supervisor, outputs) = Supervisor(directory.Path);

        await Started(supervisor, 1);
        await Task.Delay(200, TestContext.CancellationToken);

        Assert.HasCount(1, outputs.Created, "One output: the copy does not run the machine a second time.");
        await supervisor.StopAsync(TestContext.CancellationToken);
        supervisor.Dispose();
    }

    [TestMethod]
    public async Task A_removed_machine_takes_its_retained_messages_back_and_a_stopped_one_says_Shutdown()
    {
        using var directory = new TemporaryDirectory();
        var store = new RegistrationStore(directory.Path);
        store.Save(Registration("A1121O0001", "trumpf_TruMatic_A1121O0001"));
        store.Save(Registration("M3", "trumpf_TruMatic_M3"));
        var (supervisor, outputs) = Supervisor(directory.Path);
        await Started(supervisor, 2);

        Assert.AreEqual(MachineRemoval.Removed, await supervisor.RemoveAsync("A1121O0001", TestContext.CancellationToken));
        Assert.AreEqual(MachineRemoval.NotAdded, await supervisor.RemoveAsync("A1121O0001", TestContext.CancellationToken), "A machine that is not added is not removed.");
        await supervisor.StopAsync(TestContext.CancellationToken);
        supervisor.Dispose();

        var removed = outputs.Created.Single(output => output.SerialNumber == "A1121O0001");
        var stopped = outputs.Created.Single(output => output.SerialNumber == "M3");
        CollectionAssert.AreEqual(new[] { true }, removed.Stops, "Removed: its retained messages are taken back.");
        CollectionAssert.AreEqual(new[] { false }, stopped.Stops, "Stopped with the service: Shutdown.");
        Assert.IsTrue(removed.Disposed && stopped.Disposed);
        Assert.IsFalse(File.Exists(Path.Combine(directory.Path, "machines", "A1121O0001.json")));
        Assert.IsTrue(File.Exists(Path.Combine(directory.Path, "machines", "M3.json")));
        Assert.IsTrue(removed.Lost > 0, "A server that does not answer is a CommunicationFault.");
    }

    [TestMethod]
    public async Task A_machine_is_not_removed_while_the_broker_cannot_be_reached_and_is_once_it_can()
    {
        using var directory = new TemporaryDirectory();
        new RegistrationStore(directory.Path).Save(Registration("A1121O0001", "trumpf_TruMatic_A1121O0001"));
        var (supervisor, outputs) = Supervisor(directory.Path);
        await Started(supervisor, 1);
        var output = outputs.Created.Single();
        output.CanTakeBack = false;

        var refused = await supervisor.RemoveAsync("A1121O0001", TestContext.CancellationToken);

        Assert.AreEqual(MachineRemoval.BrokerUnreachable, refused, "Its retained messages could not be taken back, so it is not reported removed.");
        Assert.IsEmpty(output.Stops, "The machine keeps running as it was.");
        Assert.HasCount(1, supervisor.Machines);
        Assert.IsTrue(File.Exists(Path.Combine(directory.Path, "machines", "A1121O0001.json")), "The registration stays.");

        output.CanTakeBack = true;
        Assert.AreEqual(MachineRemoval.Removed, await supervisor.RemoveAsync("A1121O0001", TestContext.CancellationToken), "Tried again once the broker is back.");
        CollectionAssert.AreEqual(new[] { true }, output.Stops);
        Assert.IsFalse(File.Exists(Path.Combine(directory.Path, "machines", "A1121O0001.json")));
        await supervisor.StopAsync(TestContext.CancellationToken);
        supervisor.Dispose();
    }

    private sealed class FakeOutputs : IMachineOutputFactory
    {
        public List<FakeOutput> Created { get; } = [];

        public IMachineOutput Create(MachineRegistration registration, IReadOnlyList<OpenAlert> open)
        {
            var output = new FakeOutput(registration.SerialNumber, registration.Identity?.MachineId);
            lock (Created)
            {
                Created.Add(output);
            }

            return output;
        }
    }

    private sealed class FakeOutput(string serialNumber, string? machineId) : IMachineOutput
    {
        public string SerialNumber { get; } = serialNumber;

        public string? MachineId { get; } = machineId;

        public List<bool> Stops { get; } = [];

        public int Lost { get; private set; }

        public bool Disposed { get; private set; }

        public bool CanTakeBack { get; set; } = true;

        public Task StartAsync() => Task.CompletedTask;

        public Task IdentifyAsync(IdentityRegistration identity) => Task.CompletedTask;

        public Task ValueAsync(ElementRegistration element, ConvertedValue value, DateTime timestamp) => Task.CompletedTask;

        public Task ReachedAsync() => Task.CompletedTask;

        public Task LostAsync()
        {
            Lost++;
            return Task.CompletedTask;
        }

        public Task HeartbeatAsync() => Task.CompletedTask;

        public Task AlertAsync(AlertChange change, IReadOnlyList<OpenAlert> open) => Task.CompletedTask;

        public Task StopAsync(bool removed)
        {
            Stops.Add(removed);
            return Task.CompletedTask;
        }

        public ValueTask DisposeAsync()
        {
            Disposed = true;
            return ValueTask.CompletedTask;
        }
    }
}

/// <summary>A folder of its own for a test, deleted afterwards.</summary>
internal sealed class TemporaryDirectory : IDisposable
{
    public string Path { get; } = Directory.CreateTempSubdirectory("opcua-adapter-test-").FullName;

    public void Dispose()
    {
        try
        {
            Directory.Delete(Path, recursive: true);
        }
        catch (IOException)
        {
            // A file still open on a slow system: the temporary folder is cleaned up by the system.
        }
    }
}

/// <summary>A machine on its session: what an attach that fails leaves behind, and what it says.</summary>
[TestClass]
public class MachineConnectionAttachTest
{
    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task An_attach_that_fails_removes_its_subscription_and_says_CommunicationFault()
    {
        using var directory = new TemporaryDirectory();
        var registration = new MachineRegistration
        {
            SerialNumber = "A1121O0001",
            Endpoint = new EndpointRegistration { Url = "opc.tcp://machine:4840" },
            Elements = [new ElementRegistration { Path = "State.FeedOverride", Kind = ValueKind.Number, Unit = "one", Node = "nsu=urn:test;s=FeedOverride" }],
        };
        var output = new Mock<IMachineOutput>();
        var outputs = new Mock<IMachineOutputFactory>();
        outputs.Setup(factory => factory.Create(It.IsAny<MachineRegistration>(), It.IsAny<IReadOnlyList<OpenAlert>>())).Returns(output.Object);
        // The server refuses to create the subscription, as one at its limit of subscriptions does.
        var session = new Mock<ISession>();
#pragma warning disable CS0618 // The classic subscription, as the adapter uses it.
        session.SetupGet(s => s.DefaultSubscription).Returns(new Subscription());
#pragma warning restore CS0618
        session.Setup(s => s.AddSubscription(It.IsAny<Subscription>())).Returns(true);
        session.Setup(s => s.RemoveSubscriptionAsync(It.IsAny<Subscription>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var endpoint = new Mock<IEndpointSession>();
        endpoint.SetupGet(e => e.Session).Returns(session.Object);
        var connection = new MachineConnection(
            registration, outputs.Object, new AlertStore(directory.Path), TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(1), NullLogger.Instance);

        await Assert.ThrowsAsync<Exception>(() => connection.AttachAsync(endpoint.Object, TestContext.CancellationToken));

        session.Verify(s => s.RemoveSubscriptionAsync(It.IsAny<Subscription>(), It.IsAny<CancellationToken>()), Times.Once,
            "The subscription that was added is removed again: a retry does not leave one more behind.");
        output.Verify(o => o.LostAsync(), Times.Once);
        Assert.AreEqual("CommunicationFault", connection.Status.State);
    }
}
