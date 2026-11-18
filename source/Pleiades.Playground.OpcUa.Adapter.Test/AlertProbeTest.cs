using Moq;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

/// <summary>
/// The alerts a known namespace sets are stored only where the server has them: the list
/// <c>Notification.ActiveAlerts</c> of <c>urn:umati2:datamodel:opcua</c>, and <c>TcMachineAlarmType</c> of a
/// TRUMPF machine outside it. Where the server lacks them, the alerts are missing.
/// </summary>
[TestClass]
public class AlertProbeTest
{
    private const string SerialNumber = "A0280O0001";
    private const string Umati2 = "urn:umati2:datamodel:opcua";
    private const string Prefix = "urn:A0280O0001:TRUMPF:OpcSimulator/";
    private const string MachineTool = Prefix + "http://trumpf.com/UA/MachineTool/";

    public required TestContext TestContext { get; set; }

    [TestMethod]
    [DataRow(true)]
    [DataRow(false)]
    public async Task A_umati2_machine_keeps_the_list_only_where_the_server_has_its_node(bool found)
    {
        var stored = await RegisterAsync($"nsu={Umati2};s=Machine", new Server { AlertListFound = found });

        if (found)
        {
            Assert.AreEqual($"nsu={Umati2};s=Notification.ActiveAlerts", stored.Alerts?.List);
            Assert.IsFalse(stored.Missing.Any(entry => entry.Path == Topics.ActiveAlerts));
        }
        else
        {
            Assert.IsNull(stored.Alerts);
            StringAssert.Contains(stored.Missing.Single(entry => entry.Path == Topics.ActiveAlerts).Reason, "s=Notification.ActiveAlerts", StringComparison.Ordinal);
        }
    }

    [TestMethod]
    [DataRow(true)]
    [DataRow(false)]
    public async Task A_TRUMPF_machine_keeps_TcMachineAlarmType_only_where_the_server_has_it(bool found)
    {
        var stored = await RegisterAsync($"nsu={MachineTool};i=3000", new Server { AlertEventTypeFound = found });

        if (found)
        {
            Assert.AreEqual($"nsu={Prefix}http://trumpf.com/TRUMPF-Interfaces/;i=1006", stored.Alerts?.EventType);
            Assert.IsFalse(stored.Missing.Any(entry => entry.Path == Topics.ActiveAlerts));
        }
        else
        {
            Assert.IsNull(stored.Alerts);
            StringAssert.Contains(stored.Missing.Single(entry => entry.Path == Topics.ActiveAlerts).Reason, "TcMachineAlarmType", StringComparison.Ordinal);
        }
    }

    [TestMethod]
    public async Task The_probe_is_asked_for_the_alerts_the_known_namespace_set()
    {
        var server = new Server();

        await RegisterAsync($"nsu={MachineTool};i=3000", server);

        Assert.AreEqual($"nsu={Prefix}http://trumpf.com/TRUMPF-Interfaces/;i=1006", server.Probed?.Alerts?.EventType, "The probe checks the alarm type of the fallback.");
    }

    private async Task<MachineRegistration> RegisterAsync(string machineNode, Server server)
    {
        using var directory = new TemporaryDirectory();
        var outputs = new Mock<IMachineOutputFactory>(MockBehavior.Strict);
        using var supervisor = MachineIdentityRefusalTest.Supervisor(directory.Path, outputs.Object, server);
        var registration = new MachineRegistration
        {
            SerialNumber = SerialNumber,
            Endpoint = new EndpointRegistration
            {
                Url = MachineIdentityRefusalTest.Url,
                SecurityMode = SecurityMode.SignAndEncrypt,
                SecurityPolicy = "Aes256_Sha256_RsaPss",
            },
            MachineNode = machineNode,
            Elements = [.. Values.Keys.Select(path => new ElementRegistration { Path = path, Kind = ValueKind.Text, Node = $"{machineNode}.{path}" })],
        };

        var outcome = await supervisor.RegisterAsync(registration, dryRun: true, TestContext.CancellationToken);

        Assert.AreEqual(string.Empty, string.Join(" ", outcome.Problems));
        return outcome.Registration!;
    }

    private static readonly Dictionary<string, string> Values = new(StringComparer.Ordinal)
    {
        ["Identification.Manufacturer"] = "TRUMPF",
        ["Identification.SerialNumber"] = SerialNumber,
        ["Identification.ManufacturerUri"] = "https://www.trumpf.com",
        ["Identification.Model"] = "TruLaser 5030 fiber",
    };

    /// <summary>
    /// A server of the one machine the registration names, that gives a value for every node of it, with or without
    /// the nodes of the alerts.
    /// </summary>
    private sealed class Server : IRegistrationProbe
    {
        public bool AlertListFound { get; init; } = true;

        public bool AlertEventTypeFound { get; init; } = true;

        public MachineRegistration? Probed { get; private set; }

        public Task<ProbeResult> ProbeAsync(MachineRegistration registration, CancellationToken cancellationToken)
        {
            Probed = registration;
            return Task.FromResult(new ProbeResult(
                "01020304",
                ["http://opcfoundation.org/UA/"],
                [.. registration.Elements.Select(element =>
                {
                    var value = Values.GetValueOrDefault(element.Path, "1");
                    return new ProbedElement(element.Area, element.Path, element.Node, "Good", NodeFound: true, value, value, null);
                })],
                [new FoundMachine(registration.MachineNode!, "Objects/Machine", "Machine", SerialNumber, "TRUMPF", "TruLaser 5030 fiber", null, registration.MachineNode + ".Identification.SerialNumber", [])])
            {
                AlertListFound = AlertListFound,
                AlertEventTypeFound = AlertEventTypeFound,
            });
        }
    }
}
