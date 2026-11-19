using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using Opc.Ua;
using Opc.Ua.Client;
using Opc.Ua.Client.Discovery;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

/// <summary>
/// A registration is refused only without the parts of the machine id: the server has to give a value for
/// <c>Identification.ManufacturerUri</c> (or, if the server has no node for it, <c>Identification.Manufacturer</c>), <c>Model</c> and
/// <c>SerialNumber</c>.
/// </summary>
[TestClass]
public class MachineIdentityRefusalTest
{
    internal const string Url = "opc.tcp://machine:4840";
    private const string SerialNumber = "A1121O0001";

    public required TestContext TestContext { get; set; }

    [TestMethod]
    [DataRow("Identification.Model", "")]
    [DataRow("Identification.ManufacturerUri", "")]
    [DataRow("Identification.ManufacturerUri,Identification.Manufacturer", "")]
    [DataRow("Identification.Manufacturer", "Identification.ManufacturerUri")]
    public async Task A_registration_whose_server_gives_no_value_for_a_part_of_the_machine_id_is_refused(string withoutValue, string unmapped)
    {
        // A mapped ManufacturerUri that has no value yet is refused as before: the Manufacturer stands in only
        // for a registration that does not map it.
        ArgumentNullException.ThrowIfNull(withoutValue);
        ArgumentNullException.ThrowIfNull(unmapped);
        using var directory = new TemporaryDirectory();
        var outputs = new Mock<IMachineOutputFactory>(MockBehavior.Strict);
        var supervisor = Supervisor(directory.Path, outputs.Object, new ServerWithout(withoutValue.Split(',')));

        var outcome = await supervisor.RegisterAsync(
            Registration(unmapped.Split(',', StringSplitOptions.RemoveEmptyEntries)), dryRun: false, TestContext.CancellationToken);

        Assert.IsFalse(outcome.Registered);
        Assert.IsTrue(outcome.Problems.Any(problem => problem.StartsWith("identity:", StringComparison.Ordinal)), string.Join(" ", outcome.Problems));
        Assert.IsNotNull(outcome.Endpoints, "The server answered: the management API answers 409, not 400.");
        Assert.IsEmpty(supervisor.Machines, "No connection starts.");
        Assert.IsFalse(File.Exists(Path.Combine(directory.Path, "machines", SerialNumber + ".json")), "Nothing is stored.");
        outputs.VerifyNoOtherCalls();
        supervisor.Dispose();
    }

    [TestMethod]
    public async Task Without_a_ManufacturerUri_the_Manufacturer_stands_in_and_the_proposal_says_so()
    {
        using var directory = new TemporaryDirectory();
        var outputs = new Mock<IMachineOutputFactory>(MockBehavior.Strict);
        var supervisor = Supervisor(directory.Path, outputs.Object, new ServerWithout());

        var proposal = await supervisor.ProposeAsync(Registration("Identification.ManufacturerUri"), TestContext.CancellationToken);

        Assert.IsTrue(proposal.Accepted, string.Join(" ", proposal.Problems));
        Assert.AreEqual("trumpf_TruMatic-1000-fiber_A1121O0001", proposal.MachineId);
        var notice = proposal.Notices.Single();
        StringAssert.Contains(notice, "Identification.ManufacturerUri", StringComparison.Ordinal);
        StringAssert.Contains(notice, "\"TRUMPF\"", StringComparison.Ordinal);
        StringAssert.Contains(notice, "trumpf_TruMatic-1000-fiber_A1121O0001", StringComparison.Ordinal);
        outputs.VerifyNoOtherCalls();
        supervisor.Dispose();
    }

    [TestMethod]
    public async Task A_Manufacturer_without_a_letter_or_digit_A_Z_0_9_is_refused_with_that_reason()
    {
        using var directory = new TemporaryDirectory();
        var outputs = new Mock<IMachineOutputFactory>(MockBehavior.Strict);
        var supervisor = Supervisor(directory.Path, outputs.Object, new ServerWithout { Manufacturer = "ヤマザキマザック" });

        var outcome = await supervisor.RegisterAsync(Registration("Identification.ManufacturerUri"), dryRun: true, TestContext.CancellationToken);

        Assert.IsFalse(outcome.Registered);
        var problem = outcome.Problems.Single();
        StringAssert.StartsWith(problem, "identity:", StringComparison.Ordinal);
        StringAssert.Contains(problem, "\"ヤマザキマザック\"", StringComparison.Ordinal);
        StringAssert.Contains(problem, "no letter or digit", StringComparison.Ordinal);
        outputs.VerifyNoOtherCalls();
        supervisor.Dispose();
    }

    [TestMethod]
    public async Task A_server_with_a_ManufacturerUri_gives_no_notice()
    {
        using var directory = new TemporaryDirectory();
        var outputs = new Mock<IMachineOutputFactory>(MockBehavior.Strict);
        var supervisor = Supervisor(directory.Path, outputs.Object, new ServerWithout());

        var proposal = await supervisor.ProposeAsync(Registration(), TestContext.CancellationToken);

        Assert.IsTrue(proposal.Accepted, string.Join(" ", proposal.Problems));
        Assert.AreEqual("trumpf_TruMatic-1000-fiber_A1121O0001", proposal.MachineId);
        Assert.IsEmpty(proposal.Notices);
        supervisor.Dispose();
    }

    /// <summary>A supervisor whose server offers one endpoint, SignAndEncrypt with Aes256_Sha256_RsaPss, at <see cref="Url"/>.</summary>
    internal static MachineSupervisor Supervisor(string dataDirectory, IMachineOutputFactory outputs, IRegistrationProbe probe)
    {
        var credentials = new CredentialStore(dataDirectory);
        var discovery = new Mock<IOpcUaDiscoveryService>();
        discovery
            .Setup(service => service.GetEndpointsAsync(It.IsAny<string>(), It.IsAny<ArrayOf<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EndpointDescription[]
            {
                new()
                {
                    EndpointUrl = Url,
                    SecurityMode = MessageSecurityMode.SignAndEncrypt,
                    SecurityPolicyUri = SecurityPolicies.Aes256_Sha256_RsaPss,
                    ServerCertificate = ByteString.From([1, 2, 3, 4]),
                    UserIdentityTokens = new UserTokenPolicy[] { new() { TokenType = UserTokenType.Anonymous } },
                },
            });
        var client = new OpcUaClient(discovery.Object, new Mock<IManagedSessionFactory>(MockBehavior.Strict).Object, credentials);
        var config = Options.Create(new Config
        {
            MqttDestination = new MqttConfig { ConnectionString = "mqtt://broker:1883" },
            Loki = new SerilogLokiConfig { Sinks = [] },
            DataDirectory = dataDirectory,
        });
        return new MachineSupervisor(
            new RegistrationStore(dataDirectory), new AlertStore(dataDirectory), client, probe, outputs,
            new DraftStore(), credentials, config, NullLogger<MachineSupervisor>.Instance);
    }

    /// <summary>A registration that maps every value but the ones named, which are in <c>missing</c>.</summary>
    private static MachineRegistration Registration(params string[] unmapped) => new()
    {
        SerialNumber = SerialNumber,
        Endpoint = new EndpointRegistration { Url = Url, SecurityMode = SecurityMode.SignAndEncrypt, SecurityPolicy = "Aes256_Sha256_RsaPss" },
        Elements =
        [
            .. Values.Keys.Where(path => !unmapped.Contains(path))
                .Select(path => new ElementRegistration { Path = path, Kind = ValueKind.Text, Node = $"nsu=urn:test;s={path}" }),
        ],
        Missing = [.. unmapped.Select(path => new MissingElement { Path = path, Reason = "The server has no node for it." })],
    };

    private static readonly Dictionary<string, string> Values = new(StringComparer.Ordinal)
    {
        ["Identification.Manufacturer"] = "TRUMPF",
        ["Identification.SerialNumber"] = SerialNumber,
        ["Identification.ManufacturerUri"] = "https://www.trumpf.com",
        ["Identification.Model"] = "TruMatic 1000 fiber",
    };

    /// <summary>A server that has every node of the registration, and no value yet for the ones named.</summary>
    private sealed class ServerWithout(params string[] paths) : IRegistrationProbe
    {
        /// <summary>The name of the manufacturer the server gives.</summary>
        public string Manufacturer { get; init; } = Values["Identification.Manufacturer"];

        public Task<ProbeResult> ProbeAsync(MachineRegistration registration, CancellationToken cancellationToken) =>
            Task.FromResult(new ProbeResult(
                "01020304",
                ["http://opcfoundation.org/UA/", "urn:test"],
                [.. registration.Elements.Select(element => paths.Contains(element.Path)
                    ? new ProbedElement(element.Area, element.Path, element.Node, "BadWaitingForInitialData", NodeFound: true, null, null, null)
                    : new ProbedElement(element.Area, element.Path, element.Node, "Good", NodeFound: true, ValueOf(element.Path), ValueOf(element.Path), null))],
                []));

        private string ValueOf(string path) => path == "Identification.Manufacturer" ? Manufacturer : Values[path];
    }
}
