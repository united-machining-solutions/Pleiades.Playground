using System.Text.Json;
using Pleiades.Playground.OpcUa.Adapter.McpTools;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public sealed class CredentialStoreTest : IDisposable
{
    private readonly string _directory = Path.Combine(Path.GetTempPath(), "opcua-credentials-" + Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }

    [TestMethod]
    public void A_user_is_stored_per_server_and_found_by_any_spelling_of_its_address()
    {
        var store = new CredentialStore(_directory);
        store.Save("opc.tcp://OpcGateway:11878/", new Credential("operator", "secret-1"));

        Assert.AreEqual(new Credential("operator", "secret-1"), store.Find("opc.tcp://opcgateway:11878"));
        Assert.IsNull(store.Find("opc.tcp://other:4840"));
        Assert.AreEqual(new Credential("operator", "secret-1"), new CredentialStore(_directory).Find("opc.tcp://opcgateway:11878"), "Kept in the data directory.");
    }

    [TestMethod]
    public void The_list_of_users_and_the_text_of_a_credential_carry_no_password()
    {
        var store = new CredentialStore(_directory);
        store.Save("opc.tcp://opcgateway:11878", new Credential("operator", "secret-1"));

        CollectionAssert.AreEqual(new[] { new StoredUser("opc.tcp://opcgateway:11878", "operator") }, store.Users.ToArray());
        Assert.DoesNotContain("secret-1", new Credential("operator", "secret-1").ToString());
    }

    [TestMethod]
    public void A_user_is_replaced_and_removed()
    {
        var store = new CredentialStore(_directory);
        store.Save("opc.tcp://opcgateway:11878", new Credential("operator", "secret-1"));
        store.Save("opc.tcp://opcgateway:11878", new Credential("service", "secret-2"));

        Assert.AreEqual("service", store.Find("opc.tcp://opcgateway:11878")?.User);
        Assert.IsTrue(store.Remove("opc.tcp://opcgateway:11878/"));
        Assert.IsFalse(store.Remove("opc.tcp://opcgateway:11878"));
        Assert.IsNull(store.Find("opc.tcp://opcgateway:11878"));
    }
}

[TestClass]
public class UserSessionTest
{
    private static OfferedEndpoint Offer(SecurityMode mode, string policy, bool anonymous, bool userName) =>
        new("opc.tcp://gateway:11878", mode, policy, anonymous, "AB12", userName);

    [TestMethod]
    public void A_user_logs_in_over_an_encrypted_endpoint_only()
    {
        var offered = new[]
        {
            Offer(SecurityMode.None, "None", anonymous: false, userName: true),
            Offer(SecurityMode.Sign, "Aes256_Sha256_RsaPss", anonymous: false, userName: true),
            Offer(SecurityMode.SignAndEncrypt, "Basic256Sha256", anonymous: false, userName: true),
            Offer(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", anonymous: false, userName: false),
        };

        var ranked = EndpointRanking.Rank(offered, withUser: true);

        Assert.HasCount(1, ranked);
        Assert.AreEqual("Basic256Sha256", ranked[0].Endpoint.SecurityPolicy);
        Assert.IsEmpty(EndpointRanking.Rank(offered), "No endpoint takes a session without a user.");
    }

    [TestMethod]
    public void A_server_says_whether_it_wants_a_user_and_whether_it_accepts_one()
    {
        var onlyUser = new EndpointOffer("opc.tcp://gateway:11878", [Offer(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", anonymous: false, userName: true)], null);
        var both = new EndpointOffer("opc.tcp://gateway:11878", [Offer(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", anonymous: true, userName: true)], null);
        var userInTheClear = new EndpointOffer("opc.tcp://gateway:11878", [Offer(SecurityMode.None, "None", anonymous: false, userName: true)], null);

        Assert.IsTrue(onlyUser.NeedsUser);
        Assert.IsTrue(onlyUser.AcceptsUser);
        Assert.IsFalse(both.NeedsUser);
        Assert.IsTrue(both.AcceptsUser);
        Assert.IsFalse(userInTheClear.AcceptsUser);
        Assert.IsEmpty(onlyUser.Ranked, "Without a stored user, nothing is offered.");
        Assert.HasCount(1, (onlyUser with { User = "operator" }).Ranked);
    }

    [TestMethod]
    public void Machines_share_a_session_only_with_the_same_user()
    {
        var endpoint = new EndpointRegistration { Url = "opc.tcp://gateway:11878", ServerCertificateThumbprint = "AB12" };
        Assert.AreEqual(EndpointKey.Of(endpoint with { User = "operator" }), EndpointKey.Of(endpoint with { User = "operator" }));
        Assert.AreNotEqual(EndpointKey.Of(endpoint), EndpointKey.Of(endpoint with { User = "operator" }));
        Assert.AreNotEqual(EndpointKey.Of(endpoint with { User = "service" }), EndpointKey.Of(endpoint with { User = "operator" }));
    }

    [TestMethod]
    public void A_registration_with_a_user_is_refused_without_encryption()
    {
        var registration = new MachineRegistration
        {
            SerialNumber = "A1121O0001",
            Endpoint = new EndpointRegistration { Url = "opc.tcp://gateway:11878", SecurityMode = SecurityMode.Sign, User = "operator" },
            Elements = [new ElementRegistration { Path = "Vendor.Value", Area = "oem", Kind = ValueKind.Text, Node = "nsu=urn:a;i=1" }],
        };

        Assert.IsTrue(RegistrationValidator.Validate(registration).Any(problem => problem.StartsWith("endpoint.user:", StringComparison.Ordinal)));
        Assert.IsFalse(RegistrationValidator.Validate(registration with { Endpoint = registration.Endpoint with { SecurityMode = SecurityMode.SignAndEncrypt } })
            .Any(problem => problem.StartsWith("endpoint.user:", StringComparison.Ordinal)));
    }

    [TestMethod]
    public void A_refused_user_stops_the_retries_and_anything_else_is_tried_again()
    {
        var policy = new RefusedUserPolicy();

        Assert.IsTrue(policy.TryGetNextDelay(0, Opc.Ua.StatusCodes.BadUserAccessDenied, null, out var refused));
        Assert.IsNull(refused, "A wrong password is not tried again.");
        Assert.IsTrue(policy.TryGetNextDelay(0, Opc.Ua.StatusCodes.BadIdentityTokenRejected, null, out var rejected));
        Assert.IsNull(rejected);
        Assert.IsNotNull(policy.GetNextDelay(0), "A server that does not answer is tried again by the default policy.");
        Assert.IsFalse(RefusedUserPolicy.IsRefusedUser(Opc.Ua.StatusCodes.BadNotConnected));
    }

    [TestMethod]
    public void A_scan_takes_the_stored_user_on_the_side_of_the_server_and_encrypts()
    {
        var arguments = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>("""{"endpointUrl":"opc.tcp://gateway:11878","securityMode":"None","name":"scan"}""")!;

        var withUser = ScanConnect.WithUser(arguments, new Credential("operator", "secret-1"));

        Assert.AreEqual("UserName", withUser["authType"].GetString());
        Assert.AreEqual("operator", withUser["username"].GetString());
        Assert.AreEqual("secret-1", withUser["password"].GetString());
        Assert.AreEqual("SignAndEncrypt", withUser["securityMode"].GetString(), "A password never goes over an endpoint without encryption.");
        Assert.AreEqual("scan", withUser["name"].GetString());
        Assert.IsFalse(arguments.ContainsKey("password"), "The call of the model is not changed in place.");
    }
}
