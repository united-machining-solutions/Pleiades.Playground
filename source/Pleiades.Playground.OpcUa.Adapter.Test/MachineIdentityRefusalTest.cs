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
/// <c>Identification.ManufacturerUri</c>, <c>Model</c> and <c>SerialNumber</c>.
/// </summary>
[TestClass]
public class MachineIdentityRefusalTest
{
    private const string Url = "opc.tcp://machine:4840";
    private const string SerialNumber = "A1121O0001";

    public required TestContext TestContext { get; set; }

    [TestMethod]
    [DataRow("Identification.Model")]
    [DataRow("Identification.ManufacturerUri")]
    public async Task A_registration_whose_server_gives_no_value_for_a_part_of_the_machine_id_is_refused(string withoutValue)
    {
        using var directory = new TemporaryDirectory();
        var outputs = new Mock<IMachineOutputFactory>(MockBehavior.Strict);
        var supervisor = Supervisor(directory.Path, outputs.Object, new ServerWithout(withoutValue));

        var outcome = await supervisor.RegisterAsync(Registration(), dryRun: false, TestContext.CancellationToken);

        Assert.IsFalse(outcome.Registered);
        Assert.IsTrue(outcome.Problems.Any(problem => problem.StartsWith("identity:", StringComparison.Ordinal)), string.Join(" ", outcome.Problems));
        Assert.IsNotNull(outcome.Endpoints, "The server answered: the management API answers 409, not 400.");
        Assert.IsEmpty(supervisor.Machines, "No connection starts.");
        Assert.IsFalse(File.Exists(Path.Combine(directory.Path, "machines", SerialNumber + ".json")), "Nothing is stored.");
        outputs.VerifyNoOtherCalls();
        supervisor.Dispose();
    }

    private static MachineSupervisor Supervisor(string dataDirectory, IMachineOutputFactory outputs, IRegistrationProbe probe)
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

    private static MachineRegistration Registration() => new()
    {
        SerialNumber = SerialNumber,
        Endpoint = new EndpointRegistration { Url = Url, SecurityMode = SecurityMode.SignAndEncrypt, SecurityPolicy = "Aes256_Sha256_RsaPss" },
        Elements = [.. Values.Keys.Select(path => new ElementRegistration { Path = path, Kind = ValueKind.Text, Node = $"nsu=urn:test;s={path}" })],
    };

    private static readonly Dictionary<string, string> Values = new(StringComparer.Ordinal)
    {
        ["Identification.Manufacturer"] = "TRUMPF",
        ["Identification.SerialNumber"] = SerialNumber,
        ["Identification.ManufacturerUri"] = "https://www.trumpf.com",
        ["Identification.Model"] = "TruMatic 1000 fiber",
    };

    /// <summary>A server that has every node of the registration, and no value yet for one of them.</summary>
    private sealed class ServerWithout(string path) : IRegistrationProbe
    {
        public Task<ProbeResult> ProbeAsync(MachineRegistration registration, CancellationToken cancellationToken) =>
            Task.FromResult(new ProbeResult(
                "01020304",
                ["http://opcfoundation.org/UA/", "urn:test"],
                [.. registration.Elements.Select(element => element.Path == path
                    ? new ProbedElement(element.Area, element.Path, element.Node, "BadWaitingForInitialData", NodeFound: true, null, null, null)
                    : new ProbedElement(element.Area, element.Path, element.Node, "Good", NodeFound: true, Values[element.Path], Values[element.Path], null))],
                []));
    }
}
