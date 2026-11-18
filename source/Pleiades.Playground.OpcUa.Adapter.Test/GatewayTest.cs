using Microsoft.Extensions.Logging.Abstractions;
using Opc.Ua.Client;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public class EndpointKeyTest
{
    [TestMethod]
    public void An_address_is_one_server_whatever_its_case_and_its_slash_at_the_end()
    {
        Assert.AreEqual("opc.tcp://opcgateway:11878", EndpointKey.Normalize("opc.tcp://OpcGateway:11878/"));
        Assert.AreEqual("opc.tcp://machine:4840", EndpointKey.Normalize("opc.tcp://machine"));
        Assert.AreEqual("opc.tcp://machine:4840/path", EndpointKey.Normalize("opc.tcp://machine:4840/path/"));
        Assert.AreEqual("opc.tcp://opcgateway:11878", EndpointKey.Trim(" opc.tcp://opcgateway:11878/ "));
    }

    [TestMethod]
    public void Machines_with_the_same_endpoint_security_and_certificate_have_one_key()
    {
        var one = new EndpointRegistration { Url = "opc.tcp://opcgateway:11878/", ServerCertificateThumbprint = "ab12" };
        var other = new EndpointRegistration { Url = "opc.tcp://OPCGATEWAY:11878", ServerCertificateThumbprint = "AB12" };
        Assert.AreEqual(EndpointKey.Of(one), EndpointKey.Of(other));
        Assert.AreNotEqual(EndpointKey.Of(one), EndpointKey.Of(other with { SecurityPolicy = "Basic256Sha256" }));
        Assert.AreNotEqual(EndpointKey.Of(one), EndpointKey.Of(other with { ServerCertificateThumbprint = "CD34" }));
    }
}

[TestClass]
public class SessionPoolTest
{
    private static readonly EndpointRegistration Gateway = new() { Url = "opc.tcp://opcgateway:11878", ServerCertificateThumbprint = "AB12" };

    [TestMethod]
    public async Task Machines_behind_one_endpoint_share_one_session()
    {
        var connector = new FakeConnector();
        await using var pool = new SessionPool(connector, NullLogger.Instance, TimeSpan.FromMilliseconds(10));
        var first = new FakeTenant("M1", Gateway);
        var second = new FakeTenant("M2", Gateway);

        await pool.AddAsync(first, CancellationToken.None);
        await pool.AddAsync(second, CancellationToken.None);
        await Until(() => first.Attached && second.Attached);

        Assert.AreEqual(1, connector.Connects);
        Assert.AreEqual(1, pool.Count);
        CollectionAssert.AreEquivalent(new[] { "M1", "M2" }, pool.Find(Gateway)!.Names.ToArray());
    }

    [TestMethod]
    public async Task A_machine_added_to_a_standing_session_is_attached_without_a_new_connect()
    {
        var connector = new FakeConnector();
        await using var pool = new SessionPool(connector, NullLogger.Instance, TimeSpan.FromMilliseconds(10));
        var first = new FakeTenant("M1", Gateway);
        await pool.AddAsync(first, CancellationToken.None);
        await Until(() => first.Attached);

        var late = new FakeTenant("M2", Gateway);
        await pool.AddAsync(late, CancellationToken.None);

        Assert.IsTrue(late.Attached);
        Assert.AreEqual(1, connector.Connects);
    }

    [TestMethod]
    public async Task The_session_closes_only_with_the_last_machine_of_its_endpoint()
    {
        var connector = new FakeConnector();
        await using var pool = new SessionPool(connector, NullLogger.Instance, TimeSpan.FromMilliseconds(10));
        var first = new FakeTenant("M1", Gateway);
        var second = new FakeTenant("M2", Gateway);
        await pool.AddAsync(first, CancellationToken.None);
        await pool.AddAsync(second, CancellationToken.None);
        await Until(() => first.Attached && second.Attached);

        await pool.RemoveAsync(first);
        Assert.IsTrue(first.Detached, "The machine that leaves deletes its subscription.");
        Assert.IsFalse(connector.Sessions[0].Closed, "The other machine still runs on the session.");
        Assert.IsTrue(second.Attached);

        await pool.RemoveAsync(second);
        Assert.IsTrue(connector.Sessions[0].Closed);
        Assert.AreEqual(0, pool.Count);
    }

    [TestMethod]
    public async Task Machines_on_different_endpoints_have_a_session_each()
    {
        var connector = new FakeConnector();
        await using var pool = new SessionPool(connector, NullLogger.Instance, TimeSpan.FromMilliseconds(10));
        var gateway = new FakeTenant("M1", Gateway);
        var single = new FakeTenant("M2", new EndpointRegistration { Url = "opc.tcp://A0280O0001:4840", ServerCertificateThumbprint = "CD34" });
        await pool.AddAsync(gateway, CancellationToken.None);
        await pool.AddAsync(single, CancellationToken.None);
        await Until(() => gateway.Attached && single.Attached);

        Assert.AreEqual(2, connector.Connects);
        Assert.AreEqual(2, pool.Count);
    }

    [TestMethod]
    public async Task A_machine_that_cannot_be_attached_does_not_take_the_others_down()
    {
        var connector = new FakeConnector();
        await using var pool = new SessionPool(connector, NullLogger.Instance, TimeSpan.FromMilliseconds(10));
        var broken = new FakeTenant("M1", Gateway) { Fails = true };
        var fine = new FakeTenant("M2", Gateway);
        await pool.AddAsync(broken, CancellationToken.None);
        await pool.AddAsync(fine, CancellationToken.None);
        await Until(() => fine.Attached);

        Assert.IsFalse(broken.Attached);
        Assert.IsTrue(connector.Sessions[0].IsAlive);
        Assert.IsFalse(connector.Sessions[0].Closed);
    }

    [TestMethod]
    public async Task When_the_session_is_lost_every_machine_on_it_is_told_and_it_connects_again()
    {
        var connector = new FakeConnector();
        await using var pool = new SessionPool(connector, NullLogger.Instance, TimeSpan.FromMilliseconds(10));
        var first = new FakeTenant("M1", Gateway);
        var second = new FakeTenant("M2", Gateway);
        await pool.AddAsync(first, CancellationToken.None);
        await pool.AddAsync(second, CancellationToken.None);
        await Until(() => first.Attached && second.Attached);

        connector.Sessions[0].IsAlive = false;
        await Until(() => first.Downs > 0 && second.Downs > 0, TimeSpan.FromSeconds(15));
        await Until(() => connector.Connects == 2 && first.Attached && second.Attached, TimeSpan.FromSeconds(15));

        Assert.IsTrue(connector.Sessions[0].Closed);
    }

    private static async Task Until(Func<bool> condition, TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromSeconds(5));
        while (!condition())
        {
            Assert.IsLessThan(deadline, DateTime.UtcNow, "The condition did not come true in time.");
            await Task.Delay(20);
        }
    }

    private sealed class FakeSession : IEndpointSession
    {
        public ISession Session => null!;

        public bool IsAlive { get; set; } = true;

        public bool Closed { get; private set; }

        public Task CloseAsync()
        {
            Closed = true;
            return Task.CompletedTask;
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class FakeConnector : ISessionConnector
    {
        private readonly List<FakeSession> _sessions = [];

        public int Connects
        {
            get
            {
                lock (_sessions)
                {
                    return _sessions.Count;
                }
            }
        }

        public IReadOnlyList<FakeSession> Sessions
        {
            get
            {
                lock (_sessions)
                {
                    return [.. _sessions];
                }
            }
        }

        public Task<IEndpointSession> ConnectAsync(EndpointRegistration endpoint, CancellationToken cancellationToken)
        {
            var session = new FakeSession();
            lock (_sessions)
            {
                _sessions.Add(session);
            }

            return Task.FromResult<IEndpointSession>(session);
        }
    }

    private sealed class FakeTenant(string name, EndpointRegistration endpoint) : ISessionTenant
    {
        private volatile bool _attached;
        private volatile bool _detached;
        private int _downs;

        public string Name { get; } = name;

        public EndpointRegistration Endpoint { get; } = endpoint;

        public bool Fails { get; init; }

        public bool Attached => _attached;

        public bool Detached => _detached;

        public int Downs => Volatile.Read(ref _downs);

        public void SessionConnecting()
        {
        }

        public Task AttachAsync(IEndpointSession session, CancellationToken cancellationToken)
        {
            if (Fails)
            {
                throw new InvalidOperationException("The machine has no such nodes.");
            }

            _attached = true;
            return Task.CompletedTask;
        }

        public Task DetachAsync(IEndpointSession session)
        {
            _attached = false;
            _detached = true;
            return Task.CompletedTask;
        }

        public Task SessionDownAsync(string? reason)
        {
            _attached = false;
            Interlocked.Increment(ref _downs);
            return Task.CompletedTask;
        }
    }
}

[TestClass]
public class MachineFinderTest
{
    private const string Gw = "urn:Z0000Z0000:UnifiedAutomation:UaGateway";
    private const string Sim = "urn:opcsim:http://trumpf.com/UA/MachineTool/";
    private const string Other = "urn:localhost:http://trumpf.com/UA/MachineTool/";

    [TestMethod]
    public async Task An_aggregation_server_serves_each_machine_below_a_folder_of_its_own()
    {
        var space = new FakeSpace()
            .Object("i=85", "Server", "i=2253")
            .Object("i=85", "opcsim", $"nsu={Gw};s=opcsimRoot")
            .Object("i=85", "localhost", $"nsu={Gw};s=localhostRoot")
            .Object($"nsu={Gw};s=opcsimRoot", "Machines", $"nsu={Sim};i=5001")
            .Machine($"nsu={Sim};i=5001", "TruLaser", $"nsu={Sim};i=1", "A0280O0001")
            .Object($"nsu={Gw};s=localhostRoot", "Machines", $"nsu={Other};i=5001")
            .Machine($"nsu={Other};i=5001", "TruBend", $"nsu={Other};i=1", "B0000X0002");

        var machines = await MachineFinder.FindAsync(space, CancellationToken.None);

        Assert.HasCount(2, machines);
        Assert.AreEqual("A0280O0001", machines[0].SerialNumber);
        Assert.AreEqual("opcsim/Machines/TruLaser", machines[0].Path);
        Assert.AreEqual($"nsu={Sim};i=1", machines[0].Node);
        Assert.AreEqual("TRUMPF", machines[0].Manufacturer);
        CollectionAssert.Contains(machines[0].Namespaces.ToArray(), Sim);
        Assert.AreEqual("B0000X0002", machines[1].SerialNumber);
        Assert.IsFalse(space.Browsed.Contains("i=2253"), "The Server object holds no machine.");
    }

    [TestMethod]
    public async Task A_server_of_one_machine_lists_one_and_nothing_below_it_is_browsed()
    {
        var space = new FakeSpace()
            .Object("i=85", "Machines", $"nsu={Sim};i=5001")
            .Machine($"nsu={Sim};i=5001", "TruLaser", $"nsu={Sim};i=1", "A0280O0001")
            .Object($"nsu={Sim};i=1", "Spindle", $"nsu={Sim};i=99")
            .Machine($"nsu={Sim};i=99", "SpindleMotor", $"nsu={Sim};i=100", "S1");

        var machines = await MachineFinder.FindAsync(space, CancellationToken.None);

        Assert.HasCount(1, machines);
        Assert.AreEqual("A0280O0001", machines[0].SerialNumber);
        Assert.IsFalse(space.Browsed.Contains($"nsu={Sim};i=99"));
    }

    [TestMethod]
    public async Task An_object_with_an_identification_but_no_serial_number_is_no_machine_and_is_looked_below()
    {
        var space = new FakeSpace()
            .Object("i=85", "Line", $"nsu={Sim};i=10")
            .Object($"nsu={Sim};i=10", "Identification", $"nsu={Sim};i=11")
            .Object($"nsu={Sim};i=10", "Cell", $"nsu={Sim};i=12")
            .Machine($"nsu={Sim};i=12", "TruLaser", $"nsu={Sim};i=13", "A0280O0001");

        var machines = await MachineFinder.FindAsync(space, CancellationToken.None);

        Assert.HasCount(1, machines);
        Assert.AreEqual("Line/Cell/TruLaser", machines[0].Path);
    }

    [TestMethod]
    public async Task Behind_a_gateway_without_Machines_folders_a_TRUMPF_machine_is_found_by_the_root_of_its_interface()
    {
        const string a = "urn:A0280O0001:TRUMPF:OpcSimulator/";
        const string b = "urn:A1121O0001:TRUMPF:OpcSimulator/";
        var space = new FakeSpace()
            .Object("i=85", "opc-simulator", $"nsu={Gw};s=opc-simulatorRoot")
            .Object("i=85", "A1121O0001", $"nsu={Gw};s=A1121O0001Root")
            .TrumpfRoot($"nsu={Gw};s=opc-simulatorRoot", "TruLaser.A0280O0001", $"nsu={a}{TrumpfMachines.Interfaces};s=1")
            .Object($"nsu={a}{TrumpfMachines.Interfaces};s=1", "Machine", $"nsu={a}{TrumpfMachines.Interfaces};s=30")
            .Hidden($"nsu={a}{TrumpfMachines.MachineTool};i=3000", "A0280O0001")
            .TrumpfRoot($"nsu={Gw};s=A1121O0001Root", "TruMatic.A1121O0001", $"nsu={b}{TrumpfMachines.Interfaces};s=1")
            .Hidden($"nsu={b}{TrumpfMachines.MachineTool};i=3000", "A1121O0001");

        var machines = await MachineFinder.FindAsync(space, CancellationToken.None);

        Assert.HasCount(2, machines);
        Assert.AreEqual($"nsu={a}{TrumpfMachines.MachineTool};i=3000", machines[0].Node);
        Assert.AreEqual("A0280O0001", machines[0].SerialNumber, "Read below the MachineTool instance.");
        Assert.AreEqual("TRUMPF", machines[0].Manufacturer);
        Assert.AreEqual("TruLaser", machines[0].Model, "From the display name: the instance has no model.");
        Assert.AreEqual("opc-simulator/TruLaser.A0280O0001", machines[0].Path);
        CollectionAssert.IsSubsetOf(
            new[] { a + TrumpfMachines.MachineTool, a + TrumpfMachines.Interfaces },
            machines[0].Namespaces.ToArray());
        Assert.AreEqual("A1121O0001", machines[1].SerialNumber);
        Assert.AreEqual("TruMatic", machines[1].Model);
        Assert.IsFalse(space.Browsed.Contains($"nsu={a}{TrumpfMachines.Interfaces};s=30"), "The TRUMPF interface tree is not browsed.");
    }

    [TestMethod]
    public async Task A_TRUMPF_root_without_its_instance_is_listed_by_what_its_display_name_says()
    {
        const string a = "urn:A0280O0001:TRUMPF:OpcSimulator/";
        var space = new FakeSpace()
            .Object("i=85", "opc-simulator", $"nsu={Gw};s=opc-simulatorRoot")
            .TrumpfRoot($"nsu={Gw};s=opc-simulatorRoot", "TruLaser.A0280O0001", $"nsu={a}{TrumpfMachines.Interfaces};s=1");

        var machines = await MachineFinder.FindAsync(space, CancellationToken.None);

        Assert.HasCount(1, machines);
        Assert.AreEqual($"nsu={a}{TrumpfMachines.Interfaces};s=1", machines[0].Node);
        Assert.AreEqual("A0280O0001", machines[0].SerialNumber);
        Assert.IsNull(machines[0].Manufacturer);
    }

    [TestMethod]
    public async Task On_the_server_of_a_TRUMPF_machine_its_Machines_folder_and_its_root_are_one_machine()
    {
        var space = new FakeSpace()
            .Object("i=85", "Machines", "nsu=http://opcfoundation.org/UA/Machinery/;i=1001")
            .Machine("nsu=http://opcfoundation.org/UA/Machinery/;i=1001", "TrumpfMachine", $"nsu={TrumpfMachines.MachineTool};i=3000", "A0280O0001")
            .TrumpfRoot("i=85", "TruLaser.A0280O0001", $"nsu={TrumpfMachines.Interfaces};s=1");

        var machines = await MachineFinder.FindAsync(space, CancellationToken.None);

        Assert.HasCount(1, machines);
        Assert.AreEqual("Machines/TrumpfMachine", machines[0].Path);
        Assert.AreEqual("TruLaser", machines[0].Model, "The model comes from the display name of the TRUMPF root.");
    }

    [TestMethod]
    public async Task A_machine_in_the_umati2_namespace_and_its_TRUMPF_root_are_one_machine()
    {
        // The gateway of an edge device: the machine in urn:umati2:datamodel:opcua, and the same machine by its TRUMPF interface.
        const string p = "urn:Z0009A0033:TRUMPF:UAInterfaces/";
        var umati2 = $"nsu={p}urn:umati2:datamodel:opcua;s=Machine";
        var space = new FakeSpace()
            .Object("i=85", "Z0009A0033", $"nsu={Gw};s=Z0009A0033Root")
            .Machine($"nsu={Gw};s=Z0009A0033Root", "Machine", umati2, "A0280O0001")
            .TrumpfRoot($"nsu={Gw};s=Z0009A0033Root", "TruLaser.A0280O0001", $"nsu={p}{TrumpfMachines.Interfaces};s=1")
            .Hidden($"nsu={p}{TrumpfMachines.MachineTool};i=3000", "A0280O0001");

        var machines = await MachineFinder.FindAsync(space, CancellationToken.None);

        Assert.HasCount(1, machines);
        Assert.AreEqual(umati2, machines[0].Node, "The machine of the data model is kept.");
        Assert.AreEqual("TruLaser", machines[0].Model, "Its own model, or else the one of the TRUMPF root.");
        CollectionAssert.IsSubsetOf(
            new[] { p + "urn:umati2:datamodel:opcua", p + TrumpfMachines.MachineTool, p + TrumpfMachines.Interfaces },
            machines[0].Namespaces.ToArray());
    }

    [TestMethod]
    public void Machines_with_one_serial_number_are_merged_and_the_umati2_one_is_kept()
    {
        var trumpf = Found("A", "nsu=urn:gw/http://trumpf.com/UA/MachineTool/;i=3000", "urn:gw/http://trumpf.com/UA/MachineTool/");
        var umati2 = Found("A", "nsu=urn:gw/urn:umati2:datamodel:opcua;s=Machine", "urn:gw/urn:umati2:datamodel:opcua");
        var other = Found("B", $"nsu={Other};i=1", Other);

        var merged = MachineFinder.Merge([trumpf, other, umati2]);

        Assert.HasCount(2, merged);
        Assert.AreEqual(umati2.Node, merged[0].Node);
        CollectionAssert.AreEquivalent(trumpf.Namespaces.Concat(umati2.Namespaces).ToArray(), merged[0].Namespaces.ToArray());
        Assert.AreEqual(other, merged[1]);
    }

    [TestMethod]
    public void The_display_name_of_a_TRUMPF_root_is_model_dot_serial_number()
    {
        Assert.AreEqual(("TruLaser", "A0280O0001"), TrumpfMachines.Split("TruLaser.A0280O0001"));
        Assert.AreEqual(("TruLaser 5030.fiber", "A0280O0001"), TrumpfMachines.Split("TruLaser 5030.fiber.A0280O0001"));
        Assert.AreEqual(((string?)null, "A0280O0001"), TrumpfMachines.Split("A0280O0001"));
        Assert.AreEqual(((string?)null, (string?)null), TrumpfMachines.Split(" "));
        Assert.IsNull(TrumpfMachines.PrefixOfRoot($"nsu={TrumpfMachines.Interfaces};s=30"));
        Assert.IsNull(TrumpfMachines.PrefixOfRoot("nsu=http://example.com/;s=1"));
        Assert.AreEqual("urn:x/", TrumpfMachines.PrefixOfRoot($"nsu=urn:x/{TrumpfMachines.Interfaces};s=1"));
        Assert.AreEqual(string.Empty, TrumpfMachines.PrefixOfRoot($"nsu={TrumpfMachines.Interfaces};s=1"));
    }

    [TestMethod]
    public void A_namespace_two_machines_have_in_common_belongs_to_neither()
    {
        var machines = new[]
        {
            Found("A", $"nsu={Sim};i=1", Sim, "http://shared/"),
            Found("B", $"nsu={Other};i=1", Other, "http://shared/"),
        };

        var owners = MachineFinder.OwnerOfNamespace(machines);

        Assert.AreEqual("A", owners[Sim].SerialNumber);
        Assert.AreEqual("B", owners[Other].SerialNumber);
        Assert.IsFalse(owners.ContainsKey("http://shared/"));
    }

    internal static FoundMachine Found(string serialNumber, string node, params string[] namespaces) =>
        new(node, $"gw/{serialNumber}", serialNumber, serialNumber, "TRUMPF", null, null, node + "/sn", namespaces);

    private sealed class FakeSpace : IAddressSpace
    {
        private readonly Dictionary<string, List<BrowsedNode>> _children = new(StringComparer.Ordinal);
        private readonly Dictionary<string, string> _values = new(StringComparer.Ordinal);

        public HashSet<string> Browsed { get; } = new(StringComparer.Ordinal);

        public FakeSpace Object(string parent, string name, string node) => Add(parent, new BrowsedNode(node, name, name, IsObject: true));

        /// <summary>The root of a TRUMPF interface: browse name TrumpfMachine, display name Model.SerialNumber.</summary>
        public FakeSpace TrumpfRoot(string parent, string displayName, string node) =>
            Add(parent, new BrowsedNode(node, "TrumpfMachine", displayName, IsObject: true));

        /// <summary>A machine object no browse from Objects leads to: only its own node id does.</summary>
        public FakeSpace Hidden(string node, string serialNumber) => Identify(node, serialNumber);

        public FakeSpace Machine(string parent, string name, string node, string serialNumber)
        {
            Add(parent, new BrowsedNode(node, name, name, IsObject: true));
            return Identify(node, serialNumber);
        }

        private FakeSpace Identify(string node, string serialNumber)
        {
            var identification = node + "/id";
            Add(node, new BrowsedNode(identification, "Identification", "Identification", IsObject: true));
            Add(identification, new BrowsedNode(identification + "/sn", "SerialNumber", "SerialNumber", IsObject: false));
            Add(identification, new BrowsedNode(identification + "/mf", "Manufacturer", "Manufacturer", IsObject: false));
            _values[identification + "/sn"] = serialNumber;
            _values[identification + "/mf"] = "TRUMPF";
            return this;
        }

        public Task<IReadOnlyList<IReadOnlyList<BrowsedNode>>> ChildrenAsync(IReadOnlyList<string> nodes, CancellationToken cancellationToken)
        {
            Browsed.UnionWith(nodes);
            return Task.FromResult<IReadOnlyList<IReadOnlyList<BrowsedNode>>>(
                [.. nodes.Select(node => (IReadOnlyList<BrowsedNode>)(_children.TryGetValue(node, out var below) ? below : []))]);
        }

        public Task<IReadOnlyList<string?>> ReadTextsAsync(IReadOnlyList<string> nodes, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<string?>>([.. nodes.Select(node => _values.GetValueOrDefault(node))]);

        private FakeSpace Add(string parent, BrowsedNode child)
        {
            if (!_children.TryGetValue(parent, out var below))
            {
                _children[parent] = below = [];
            }

            below.Add(child);
            return this;
        }
    }
}

[TestClass]
public class MachineChecksTest
{
    private const string Sim = "urn:opcsim:http://trumpf.com/UA/MachineTool/";
    private const string Other = "urn:localhost:http://trumpf.com/UA/MachineTool/";

    private static readonly FoundMachine[] TwoMachines =
    [
        MachineFinderTest.Found("A0280O0001", $"nsu={Sim};i=1", Sim),
        MachineFinderTest.Found("B0000X0002", $"nsu={Other};i=1", Other),
    ];

    private static MachineRegistration Registration(string serialNumber, string? machineNode, params string[] nodes) => new()
    {
        SerialNumber = serialNumber,
        MachineNode = machineNode,
        Endpoint = new EndpointRegistration { Url = "opc.tcp://opcgateway:11878" },
        Elements = [.. nodes.Select((node, index) => new ElementRegistration { Path = $"Vendor.Value{index}", Area = "oem", Kind = ValueKind.Text, Node = node })],
    };

    [TestMethod]
    public void On_a_server_of_one_machine_no_machine_node_is_needed()
    {
        var problems = MachineChecks.Problems(Registration("A0280O0001", null, $"nsu={Sim};i=3"), [TwoMachines[0]], "A0280O0001");
        Assert.IsEmpty(problems);
    }

    [TestMethod]
    public void The_serial_number_is_the_one_the_server_gives()
    {
        var problems = MachineChecks.Problems(Registration("A0280O0001", null, $"nsu={Sim};i=3"), [TwoMachines[0]], "A0280O0009");
        Assert.HasCount(1, problems);
        StringAssert.Contains(problems[0], "A0280O0009", StringComparison.Ordinal);
    }

    [TestMethod]
    public void Behind_a_gateway_a_registration_names_its_machine()
    {
        var problems = MachineChecks.Problems(Registration("A0280O0001", null, $"nsu={Sim};i=3"), TwoMachines, "A0280O0001");
        Assert.HasCount(1, problems, "The nodes are not judged one by one before the machine is named.");
        StringAssert.StartsWith(problems[0], "machineNode:", StringComparison.Ordinal);
        StringAssert.Contains(problems[0], $"Its nodes belong to A0280O0001: machineNode nsu={Sim};i=1.", StringComparison.Ordinal);
        StringAssert.Contains(problems[0], "B0000X0002", StringComparison.Ordinal);
    }

    [TestMethod]
    public void The_machine_node_has_the_serial_number_of_the_registration()
    {
        var problems = MachineChecks.Problems(Registration("B0000X0002", $"nsu={Sim};i=1", $"nsu={Sim};i=3"), TwoMachines, null);
        Assert.IsTrue(problems.Any(problem => problem.Contains("A0280O0001", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void A_node_of_another_machine_is_refused()
    {
        var problems = MachineChecks.Problems(
            Registration("A0280O0001", $"nsu={Sim};i=1", $"nsu={Sim};i=3", $"nsu={Other};i=3"), TwoMachines, "A0280O0001");
        Assert.HasCount(1, problems);
        StringAssert.Contains(problems[0], "B0000X0002", StringComparison.Ordinal);
    }

    [TestMethod]
    public void A_registration_of_its_own_machine_passes()
    {
        var problems = MachineChecks.Problems(
            Registration("A0280O0001", $"nsu={Sim};i=1", $"nsu={Sim};i=3", "nsu=http://trumpf.com/TRUMPF-Interfaces/;i=7"), TwoMachines, "A0280O0001");
        Assert.IsEmpty(problems);
    }

    [TestMethod]
    public void The_namespaces_of_a_machine_are_those_of_its_elements_and_its_node_not_of_its_alarm_type()
    {
        var registration = Registration("A0280O0001", $"nsu={Sim};i=1", $"nsu={Sim};i=3", "i=2255") with
        {
            Alerts = new AlertRegistration { EventType = "nsu=http://trumpf.com/UA/Types/;i=1006" },
        };

        CollectionAssert.AreEquivalent(new[] { Sim }, MachineNamespaces.Of(registration).ToArray());
    }

    [TestMethod]
    public void A_machine_node_must_carry_its_namespace_as_a_uri()
    {
        var problems = RegistrationValidator.Validate(Registration("A0280O0001", "ns=3;i=1", $"nsu={Sim};i=3"));
        Assert.IsTrue(problems.Any(problem => problem.StartsWith("machineNode:", StringComparison.Ordinal)));
    }
}
