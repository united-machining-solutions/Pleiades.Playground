using System.Text.Json;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public class EndpointRankingTest
{
    private static OfferedEndpoint Offer(SecurityMode mode, string policy, bool anonymous = true) =>
        new("opc.tcp://machine:4840", mode, policy, anonymous, "AB12");

    [TestMethod]
    public void Encryption_comes_before_signing_and_a_stronger_policy_before_a_weaker_one()
    {
        var ranked = EndpointRanking.Rank(
        [
            Offer(SecurityMode.None, "None"),
            Offer(SecurityMode.Sign, "Aes256_Sha256_RsaPss"),
            Offer(SecurityMode.SignAndEncrypt, "Basic256Sha256"),
            Offer(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss"),
            Offer(SecurityMode.SignAndEncrypt, "Aes128_Sha256_RsaOaep"),
        ]);

        CollectionAssert.AreEqual(
            new[]
            {
                "SignAndEncrypt/Aes256_Sha256_RsaPss",
                "SignAndEncrypt/Aes128_Sha256_RsaOaep",
                "SignAndEncrypt/Basic256Sha256",
                "Sign/Aes256_Sha256_RsaPss",
                "None/None",
            },
            ranked.Select(one => $"{one.Endpoint.SecurityMode}/{one.Endpoint.SecurityPolicy}").ToArray());
        Assert.IsTrue(ranked[0].Recommended);
        Assert.AreEqual(1, ranked.Count(one => one.Recommended));
    }

    [TestMethod]
    public void Without_encryption_or_with_an_old_policy_an_endpoint_is_weak()
    {
        Assert.IsFalse(EndpointRanking.IsWeak(SecurityMode.SignAndEncrypt, "Basic256Sha256"));
        Assert.IsTrue(EndpointRanking.IsWeak(SecurityMode.Sign, "Aes256_Sha256_RsaPss"));
        Assert.IsTrue(EndpointRanking.IsWeak(SecurityMode.None, "None"));
        Assert.IsTrue(EndpointRanking.IsWeak(SecurityMode.SignAndEncrypt, "Basic128Rsa15"));
    }

    [TestMethod]
    public void An_endpoint_that_wants_a_user_is_not_offered_to_a_session_without_one()
    {
        var ranked = EndpointRanking.Rank(
        [
            Offer(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", anonymous: false),
            Offer(SecurityMode.SignAndEncrypt, "Basic256Sha256"),
        ]);

        Assert.HasCount(1, ranked);
        Assert.AreEqual("Basic256Sha256", ranked[0].Endpoint.SecurityPolicy);
    }

    [TestMethod]
    public void A_policy_the_list_does_not_know_ranks_above_the_known_ones_of_its_mode()
    {
        Assert.IsGreaterThan(
            EndpointRanking.Score(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss"),
            EndpointRanking.Score(SecurityMode.SignAndEncrypt, "ECC_nistP384"));
        Assert.IsLessThan(
            EndpointRanking.Score(SecurityMode.SignAndEncrypt, "Basic256Sha256"),
            EndpointRanking.Score(SecurityMode.Sign, "ECC_nistP384"));
    }

    [TestMethod]
    public void The_short_name_of_a_policy_is_what_follows_the_hash()
    {
        Assert.AreEqual("Basic256Sha256", EndpointRanking.ShortName("http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256"));
        Assert.AreEqual("None", EndpointRanking.ShortName(null));
        Assert.AreEqual("http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256", EndpointRanking.PolicyUri("Basic256Sha256"));
    }
}

[TestClass]
public class RegistrationValidatorTest
{
    private static MachineRegistration Sample() =>
        JsonSerializer.Deserialize<MachineRegistration>(
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "trumpf-trulaser-l26.registration.json")),
            RegistrationJson.Options)!;

    [TestMethod]
    public void The_registration_that_ships_as_an_example_is_valid_and_covers_core()
    {
        var sample = Sample();

        Assert.IsEmpty(RegistrationValidator.Validate(sample));
        CollectionAssert.Contains(sample.Profiles.ToArray(), "Core");
        Assert.AreEqual("A0280O0001", sample.SerialNumber);
    }

    [TestMethod]
    public void Core_without_one_of_its_mandatory_elements_is_refused()
    {
        var sample = Sample();
        var without = sample with { Elements = [.. sample.Elements.Where(element => element.Path != "OperationCounters.PowerOnDuration")] };

        var problems = RegistrationValidator.Validate(without);

        Assert.HasCount(1, problems);
        StringAssert.Contains(problems[0], "OperationCounters.PowerOnDuration", StringComparison.Ordinal);
    }

    [TestMethod]
    [DataRow("nsu=http://trumpf.com/UA/MachineTool/;i=3003", true)]
    [DataRow("nsu=http://trumpf.com/TRUMPF-Interfaces/;s=35.Running", true)]
    [DataRow("i=2253", true)]
    [DataRow("ns=7;i=3003", false)]
    [DataRow("nsu=;i=3003", false)]
    [DataRow("nsu=http://trumpf.com/UA/MachineTool/", false)]
    [DataRow("", false)]
    public void A_node_carries_its_namespace_as_a_uri_never_as_an_index(string node, bool expected)
    {
        Assert.AreEqual(expected, RegistrationValidator.IsPortableNode(node));
    }

    [TestMethod]
    public void What_is_wrong_with_an_element_is_said_per_element()
    {
        var registration = new MachineRegistration
        {
            SerialNumber = "bad/serial",
            Endpoint = new EndpointRegistration { Url = "http://machine" },
            Elements =
            [
                new ElementRegistration { Path = "State.FeedOverride", Kind = ValueKind.Number, Node = "ns=2;i=1" },
                new ElementRegistration { Path = "State.FeedOverride", Kind = ValueKind.Text, Unit = "one", Node = "i=1" },
                new ElementRegistration { Path = "Connection.State", Kind = ValueKind.Text, Node = "i=2" },
            ],
        };

        var problems = string.Join("\n", RegistrationValidator.Validate(registration));

        StringAssert.Contains(problems, "serialNumber:", StringComparison.Ordinal);
        StringAssert.Contains(problems, "endpoint.url:", StringComparison.Ordinal);
        StringAssert.Contains(problems, "not an index", StringComparison.Ordinal);
        StringAssert.Contains(problems, "needs a unit", StringComparison.Ordinal);
        StringAssert.Contains(problems, "is named twice", StringComparison.Ordinal);
        StringAssert.Contains(problems, "belong to a number only", StringComparison.Ordinal);
        StringAssert.Contains(problems, "publishes the connection itself", StringComparison.Ordinal);
    }
}

[TestClass]
public class RegistrationStoreTest
{
    private string _directory = string.Empty;

    [TestInitialize]
    public void CreateDirectory()
    {
        _directory = Path.Combine(Path.GetTempPath(), "pleiades-opcua-adapter-test-" + Guid.NewGuid().ToString("N"));
    }

    [TestCleanup]
    public void DeleteDirectory()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }

    [TestMethod]
    public void A_registration_is_there_again_after_a_restart()
    {
        var registration = new MachineRegistration
        {
            SerialNumber = "P-99",
            Profiles = ["Core"],
            Endpoint = new EndpointRegistration { Url = "opc.tcp://machine:4840", ServerCertificateThumbprint = "AB12" },
            Elements =
            [
                new ElementRegistration
                {
                    Path = "State.FeedOverride",
                    Kind = ValueKind.Number,
                    Unit = "one",
                    Scale = 0.01,
                    Node = "nsu=http://example.com/;i=7",
                },
            ],
        };
        new RegistrationStore(_directory).Save(registration);

        // A new store on the same directory is what the adapter has after a restart.
        var loaded = new RegistrationStore(_directory).LoadAll();

        Assert.HasCount(1, loaded);
        Assert.AreEqual("P-99", loaded[0].SerialNumber);
        Assert.AreEqual("AB12", loaded[0].Endpoint.ServerCertificateThumbprint);
        Assert.AreEqual(SecurityMode.SignAndEncrypt, loaded[0].Endpoint.SecurityMode);
        Assert.AreEqual(0.01, loaded[0].Elements[0].Scale);
        Assert.AreEqual("nsu=http://example.com/;i=7", loaded[0].Elements[0].Node);
    }

    [TestMethod]
    public void A_removed_machine_is_gone_and_an_unreadable_file_is_skipped()
    {
        var store = new RegistrationStore(_directory);
        store.Save(new MachineRegistration { SerialNumber = "P-98" });
        File.WriteAllText(Path.Combine(_directory, "machines", "broken.json"), "{ not json");
        var unreadable = new List<string>();

        Assert.HasCount(1, store.LoadAll((file, _) => unreadable.Add(file)));
        Assert.HasCount(1, unreadable);
        Assert.IsTrue(store.Delete("P-98"));
        Assert.IsFalse(store.Delete("P-98"));
        Assert.IsEmpty(store.LoadAll());
    }

    [TestMethod]
    public void A_serial_number_cannot_leave_the_folder_of_the_store()
    {
        var store = new RegistrationStore(_directory);

        store.Save(new MachineRegistration { SerialNumber = @"..\..\escape" });

        Assert.HasCount(1, Directory.GetFiles(Path.Combine(_directory, "machines")));
        Assert.IsFalse(File.Exists(Path.Combine(_directory, "escape.json")));
    }
}
