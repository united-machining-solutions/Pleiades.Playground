using Moq;
using Opc.Ua;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

/// <summary>A person chooses the security of a server, a weaker one and one without security included.</summary>
[TestClass]
public class SecurityChoiceTest
{
    private const string Url = MachineIdentityRefusalTest.Url;

    public required TestContext TestContext { get; set; }

    private static OfferedEndpoint Offer(SecurityMode mode, string policy, bool anonymous = true, bool userName = false) =>
        new(Url, mode, policy, anonymous, "01020304", userName);

    private static readonly OfferedEndpoint[] Offered =
    [
        Offer(SecurityMode.None, "None"),
        Offer(SecurityMode.Sign, "Basic256Sha256"),
        Offer(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", userName: true),
    ];

    [TestMethod]
    public void Without_a_choice_the_strongest_endpoint_is_taken_and_with_one_the_chosen()
    {
        var strongest = EndpointRanking.ForSession(Offered, withStoredUser: false);
        var chosen = EndpointRanking.ForSession(Offered, withStoredUser: false, new SecurityChoice(SecurityMode.None, "None"));

        Assert.AreEqual("Aes256_Sha256_RsaPss", strongest.Single(endpoint => endpoint.Recommended).Endpoint.SecurityPolicy);
        Assert.AreEqual(SecurityMode.None, chosen.Single(endpoint => endpoint.Recommended).Endpoint.SecurityMode);
        Assert.AreEqual(SecurityMode.SignAndEncrypt, chosen[0].Endpoint.SecurityMode, "The order stays strongest first.");
        Assert.IsTrue(chosen.Single(endpoint => endpoint.Recommended).Weak);
    }

    [TestMethod]
    public void A_choice_the_server_no_longer_offers_falls_back_to_the_strongest()
    {
        var ranked = EndpointRanking.ForSession(Offered, withStoredUser: false, new SecurityChoice(SecurityMode.SignAndEncrypt, "Basic256"));

        Assert.AreEqual("Aes256_Sha256_RsaPss", ranked.Single(endpoint => endpoint.Recommended).Endpoint.SecurityPolicy);
        var offer = new EndpointOffer(Url, Offered, null, new SecurityChoice(SecurityMode.SignAndEncrypt, "Basic256"));
        Assert.IsNull(offer.ChoiceInEffect, "The card does not say that a person chose what the adapter does not take.");
    }

    [TestMethod]
    public void A_session_is_anonymous_where_it_can_be_and_takes_the_user_only_where_an_endpoint_wants_one()
    {
        var offered = new[]
        {
            Offer(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", anonymous: false, userName: true),
            Offer(SecurityMode.None, "None"),
        };

        var withoutUser = EndpointRanking.ForSession(offered, withStoredUser: false);
        var withUser = EndpointRanking.ForSession(offered, withStoredUser: true);

        Assert.HasCount(1, withoutUser);
        Assert.IsFalse(withoutUser[0].WithUser);
        Assert.HasCount(2, withUser);
        Assert.IsTrue(withUser[0].WithUser, "The encrypted endpoint takes no anonymous session.");
        Assert.IsFalse(withUser[1].WithUser);
    }

    [TestMethod]
    public void After_a_refused_anonymous_session_the_user_logs_in_over_an_encrypted_endpoint_only()
    {
        var offer = new EndpointOffer(Url, Offered, "operator", new SecurityChoice(SecurityMode.None, "None"));

        var after = offer.UserEndpointAfter(offer.Used!);

        Assert.IsNotNull(after);
        Assert.AreEqual(SecurityMode.SignAndEncrypt, after.Endpoint.SecurityMode);
        Assert.IsTrue(after.WithUser);
        Assert.IsNull(new EndpointOffer(Url, [Offer(SecurityMode.None, "None", userName: true)], "operator").UserEndpointAfter(
            EndpointRanking.ForSession([Offer(SecurityMode.None, "None", userName: true)], withStoredUser: true)[0]));
    }

    [TestMethod]
    public void A_choice_is_kept_per_server_found_by_any_spelling_of_its_address_and_removed()
    {
        using var directory = new TemporaryDirectory();
        var store = new SecurityChoiceStore(directory.Path);

        store.Save("opc.tcp://Machine:4840/", new SecurityChoice(SecurityMode.None, "None"));

        Assert.AreEqual(new SecurityChoice(SecurityMode.None, "None"), new SecurityChoiceStore(directory.Path).Find("opc.tcp://machine:4840"));
        Assert.HasCount(1, store.Choices);
        Assert.IsTrue(store.Remove("opc.tcp://machine:4840"));
        Assert.IsFalse(store.Remove("opc.tcp://machine:4840"));
        Assert.IsNull(store.Find("opc.tcp://machine:4840"));
    }

    [TestMethod]
    public void A_broken_file_of_choices_is_moved_aside_and_every_server_gets_its_strongest_endpoint()
    {
        using var directory = new TemporaryDirectory();
        File.WriteAllText(Path.Combine(directory.Path, "security.json"), "{ not json");
        string? told = null;

        var store = new SecurityChoiceStore(directory.Path, reason => told = reason);

        Assert.IsNull(store.Find(Url));
        Assert.IsNotNull(told);
        Assert.IsTrue(File.Exists(Path.Combine(directory.Path, "security.json.unreadable")));
    }

    private static readonly Opc.Ua.EndpointDescription[] Server =
    [
        MachineIdentityRefusalTest.Offered(MessageSecurityMode.SignAndEncrypt, SecurityPolicies.Aes256_Sha256_RsaPss, UserTokenType.Anonymous, UserTokenType.UserName),
        MachineIdentityRefusalTest.Offered(MessageSecurityMode.None, SecurityPolicies.None, UserTokenType.Anonymous),
    ];

    private static MachineRegistration WithoutSecurity() =>
        MachineIdentityRefusalTest.Registration() with
        {
            Endpoint = new EndpointRegistration { Url = Url, SecurityMode = SecurityMode.None, SecurityPolicy = "None" },
        };

    [TestMethod]
    public async Task A_registration_without_security_is_refused_until_a_person_chose_it()
    {
        using var directory = new TemporaryDirectory();
        var outputs = new Mock<IMachineOutputFactory>(MockBehavior.Strict);
        var supervisor = MachineIdentityRefusalTest.Supervisor(directory.Path, outputs.Object, new MachineIdentityRefusalTest.ServerWithout(), Server);

        var before = await supervisor.RegisterAsync(WithoutSecurity(), dryRun: true, TestContext.CancellationToken);
        var refusal = await supervisor.SaveSecurityAsync(Url, new SecurityChoice(SecurityMode.None, "None"), TestContext.CancellationToken);
        var after = await supervisor.RegisterAsync(WithoutSecurity(), dryRun: true, TestContext.CancellationToken);

        Assert.IsFalse(before.Registered);
        Assert.IsTrue(before.Problems.Any(problem => problem.StartsWith("endpoint:", StringComparison.Ordinal)), string.Join(" ", before.Problems));
        Assert.IsNull(refusal);
        Assert.IsTrue(after.Registered, string.Join(" ", after.Problems));
        Assert.IsTrue(after.Registration!.Endpoint.AllowWeaker, "The registration keeps the decision of the person.");
        Assert.IsTrue((await supervisor.OfferAsync(Url, TestContext.CancellationToken)).Ranked.Single(endpoint => endpoint.Recommended).Weak);
        supervisor.Dispose();
    }

    [TestMethod]
    public async Task A_person_cannot_choose_an_endpoint_the_server_does_not_offer()
    {
        using var directory = new TemporaryDirectory();
        var outputs = new Mock<IMachineOutputFactory>(MockBehavior.Strict);
        var supervisor = MachineIdentityRefusalTest.Supervisor(directory.Path, outputs.Object, new MachineIdentityRefusalTest.ServerWithout(), Server);

        var refusal = await supervisor.SaveSecurityAsync(Url, new SecurityChoice(SecurityMode.Sign, "Basic256Sha256"), TestContext.CancellationToken);

        Assert.IsNotNull(refusal);
        Assert.IsEmpty(supervisor.SecurityChoices);
        supervisor.Dispose();
    }

    [TestMethod]
    public async Task A_proposal_is_anonymous_without_a_stored_user_and_logs_in_with_one_a_person_stored()
    {
        using var directory = new TemporaryDirectory();
        var outputs = new Mock<IMachineOutputFactory>(MockBehavior.Strict);
        var anonymous = new SeenUsers(refuseAnonymous: false);
        var withUser = new SeenUsers(refuseAnonymous: false);

        var first = MachineIdentityRefusalTest.Supervisor(directory.Path, outputs.Object, anonymous, Server);
        var withoutUser = await first.RegisterAsync(MachineIdentityRefusalTest.Registration(), dryRun: true, TestContext.CancellationToken);
        new CredentialStore(directory.Path).Save(Url, new Credential("operator", "secret-1"));
        var second = MachineIdentityRefusalTest.Supervisor(directory.Path, outputs.Object, withUser, Server);
        var stored = await second.RegisterAsync(MachineIdentityRefusalTest.Registration(), dryRun: true, TestContext.CancellationToken);

        Assert.IsTrue(withoutUser.Registered, string.Join(" ", withoutUser.Problems));
        Assert.IsNull(withoutUser.Registration!.Endpoint.User);
        CollectionAssert.AreEqual(new string?[] { null }, anonymous.Users);
        Assert.IsTrue(stored.Registered, string.Join(" ", stored.Problems));
        Assert.AreEqual("operator", stored.Registration!.Endpoint.User, "The user a person stored goes before an anonymous session, which may see less.");
        CollectionAssert.AreEqual(new string?[] { "operator" }, withUser.Users);
        first.Dispose();
        second.Dispose();
    }

    [TestMethod]
    public void A_stored_user_starts_the_sessions_of_the_machines_on_an_encrypted_endpoint_of_its_server_anew()
    {
        var offer = new EndpointOffer(
            Url,
            [Offer(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", userName: true), Offer(SecurityMode.None, "None")],
            "operator");
        MachineRegistration On(string serialNumber, string url, SecurityMode mode, string policy, string? user = null) =>
            MachineIdentityRefusalTest.Registration() with
            {
                SerialNumber = serialNumber,
                Endpoint = new EndpointRegistration { Url = url, SecurityMode = mode, SecurityPolicy = policy, User = user },
            };

        var reconnecting = MachineSupervisor.ReconnectingWithUser(
            [
                On("anonymous", "opc.tcp://MACHINE:4840/", SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss"),
                On("other-user", Url, SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", user: "service"),
                On("no-security", Url, SecurityMode.None, "None"),
                On("other-server", "opc.tcp://other:4840", SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss"),
            ],
            offer,
            "operator");

        CollectionAssert.AreEqual(new[] { "anonymous", "other-user" }, reconnecting.Select(registration => registration.SerialNumber).ToArray());
        Assert.IsTrue(reconnecting.All(registration => registration.Endpoint.User == "operator"));
    }

    [TestMethod]
    public void A_stored_choice_the_server_does_not_offer_is_still_named_and_not_in_effect_until_it_comes_back()
    {
        var choice = new SecurityChoice(SecurityMode.None, "None");
        var gone = new EndpointOffer(Url, [Offer(SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss")], null, choice);
        var back = gone with { Offered = [.. gone.Offered, Offer(SecurityMode.None, "None")] };

        var whileGone = Api.Views.Ranking(gone);
        var whenBack = Api.Views.Ranking(back);

        Assert.AreEqual(choice, whileGone.Chosen, "The card names the stored choice, so a person can forget it.");
        Assert.IsFalse(whileGone.ChosenInEffect);
        Assert.AreEqual(SecurityMode.SignAndEncrypt, whileGone.Endpoints.Single(endpoint => endpoint.Recommended).SecurityMode);
        Assert.IsTrue(whenBack.ChosenInEffect, "Offered again, the choice is taken again.");
        Assert.AreEqual(SecurityMode.None, whenBack.Endpoints.Single(endpoint => endpoint.Recommended).SecurityMode);
    }

    [TestMethod]
    public void A_request_without_a_security_mode_chooses_nothing_not_None()
    {
        var withoutMode = System.Text.Json.JsonSerializer.Deserialize<Api.SecurityRequest>(
            """{"url":"opc.tcp://machine:4840","securityPolicy":"None"}""", RegistrationJson.Options)!;
        var withMode = System.Text.Json.JsonSerializer.Deserialize<Api.SecurityRequest>(
            """{"url":"opc.tcp://machine:4840","securityMode":"Sign","securityPolicy":"http://opcfoundation.org/UA/SecurityPolicy#Basic256Sha256"}""",
            RegistrationJson.Options)!;

        Assert.IsNull(withoutMode.Choice(out var problem));
        Assert.IsNotNull(problem);
        Assert.AreEqual(new SecurityChoice(SecurityMode.Sign, "Basic256Sha256"), withMode.Choice(out _));
        Assert.IsNull(new Api.SecurityRequest(Url, SecurityMode.Sign, " ").Choice(out _));
    }

    [TestMethod]
    public async Task A_write_waits_for_a_file_another_process_holds_for_a_moment()
    {
        using var directory = new TemporaryDirectory();
        var file = Path.Combine(directory.Path, "security.json");
        File.WriteAllText(file, "{}");

        // Held as a virus scanner holds a file it just saw: the move over it fails on Windows until it lets go.
        var held = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.None);
        var release = Task.Run(async () =>
        {
            await Task.Delay(AtomicFile.Pause * 2, TestContext.CancellationToken);
            await held.DisposeAsync();
        }, TestContext.CancellationToken);

        AtomicFile.Write(file, """{"written":true}""");
        await release;

        Assert.AreEqual("""{"written":true}""", AtomicFile.ReadAllText(file));
        Assert.IsFalse(File.Exists(file + ".new"));
    }

    /// <summary>A server that has every node, and refuses an anonymous session if told to. Notes the user of every probe.</summary>
    private sealed class SeenUsers(bool refuseAnonymous) : IRegistrationProbe
    {
        private readonly MachineIdentityRefusalTest.ServerWithout _server = new();

        public List<string?> Users { get; } = [];

        public Task<ProbeResult> ProbeAsync(MachineRegistration registration, CancellationToken cancellationToken)
        {
            Users.Add(registration.Endpoint.User);
            return refuseAnonymous && registration.Endpoint.User is null
                ? throw new ServiceResultException(StatusCodes.BadIdentityTokenRejected)
                : _server.ProbeAsync(registration, cancellationToken);
        }
    }
}
