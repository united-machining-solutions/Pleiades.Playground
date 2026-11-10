using Microsoft.Extensions.Diagnostics.HealthChecks;
using MQTTnet;
using MQTTnet.Client;
using MQTTnet.Extensions.ManagedClient;
using MQTTnet.Packets;

namespace Pleiades.Playground.HealthChecks.Mqtt.Test;

/// <summary>
/// Readiness from the broker's answer. <c>ManagedMqttClient.SubscribeAsync</c> queues a
/// subscription and returns, with no broker as well, so a mark set on its return reported Healthy
/// before the broker had even received the SUBSCRIBE. Only the SUBACK says what the broker granted.
/// </summary>
/// <remarks>
/// Every SUBACK here arrives the way MQTTnet delivers it: as <c>SubscriptionsChangedAsync</c> raised
/// on the client the worker wired the readiness to, not as a direct call into the readiness.
/// </remarks>
[TestClass]
public sealed class MqttSubscriptionSubackTest
{
    private const string Topic = "machines/+/events/notifications";
    private const string Other = "machines/+/timeseries";
    private const string Third = "machines/+/jobs";

    private static readonly HealthCheckContext Context = new();

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task AfterSubscribeAsync_WithoutASuback_ItIsUnhealthyAndSaysWhy()
    {
        // THE PREMISE, against the real client: it is never started, so there is no broker at all,
        // and SubscribeAsync returns anyway. A mark set on that return reports Healthy too early.
        using var client = new MqttFactory().CreateManagedMqttClient();
        var readiness = new MqttSubscriptionReadiness();
        client.SubscriptionsChangedAsync += readiness.HandleSubscriptionsChangedAsync;

        readiness.MarkRequested(Topic);
        await client.SubscribeAsync(Topic);

        var result = await CheckAsync(readiness);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status,
            "SubscribeAsync returned without a broker, so its return cannot be the readiness");
        Assert.Contains($"'{Topic}' (no SUBACK)", result.Description ?? string.Empty,
            "the reason names the filter and that the broker has not answered");
    }

    [TestMethod]
    [DataRow(MqttClientSubscribeResultCode.GrantedQoS0)]
    [DataRow(MqttClientSubscribeResultCode.GrantedQoS1)]
    [DataRow(MqttClientSubscribeResultCode.GrantedQoS2)]
    public async Task OnceTheBrokerGrantsEveryFilter_ItIsHealthy(MqttClientSubscribeResultCode granted)
    {
        var client = new Mock<IManagedMqttClient>();
        var readiness = Wired(client);
        readiness.MarkRequested(Topic, Other);

        await RaiseSubackAsync(client, (Topic, granted), (Other, granted));

        var result = await CheckAsync(readiness);

        Assert.AreEqual(HealthStatus.Healthy, result.Status, $"{granted} is a grant");
        Assert.Contains($"'{Topic}' ({granted})", result.Description ?? string.Empty);
        Assert.Contains($"'{Other}' ({granted})", result.Description ?? string.Empty);
    }

    [TestMethod]
    [DataRow(MqttClientSubscribeResultCode.NotAuthorized)]
    [DataRow(MqttClientSubscribeResultCode.TopicFilterInvalid)]
    [DataRow(MqttClientSubscribeResultCode.UnspecifiedError)]
    public async Task WhenTheBrokerRefusesAFilter_ItIsUnhealthyAndNamesTopicAndCode(
        MqttClientSubscribeResultCode refused)
    {
        // The case the client-side mark could not see: CONNECT accepted, SUBSCRIBE refused - an ACL
        // that does not grant the topic. The process runs and receives nothing on that filter.
        var client = new Mock<IManagedMqttClient>();
        var readiness = Wired(client);
        readiness.MarkRequested(Topic, Other);

        await RaiseSubackAsync(client, (Topic, MqttClientSubscribeResultCode.GrantedQoS1), (Other, refused));

        var result = await CheckAsync(readiness);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.Contains($"'{Other}' ({refused})", result.Description ?? string.Empty,
            "an operator needs the filter and the broker's code, not only that something is wrong");
        Assert.DoesNotContain($"'{Topic}'", result.Description ?? string.Empty,
            "the reason lists what is NOT granted; a granted filter in it would send the reader the wrong way");
    }

    [TestMethod]
    public async Task UntilEveryFilterIsAnswered_TheReasonNamesEachOneStillMissing()
    {
        // A bridge may carry on when single topics fail, so "something is missing" is not
        // enough there: the reason has to name every filter without a grant.
        var client = new Mock<IManagedMqttClient>();
        var readiness = Wired(client);
        readiness.MarkRequested(Topic, Other, Third);

        await RaiseSubackAsync(client, (Topic, MqttClientSubscribeResultCode.GrantedQoS1));

        var result = await CheckAsync(readiness);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.Contains("2 of 3", result.Description ?? string.Empty);
        Assert.Contains($"'{Other}' (no SUBACK)", result.Description ?? string.Empty);
        Assert.Contains($"'{Third}' (no SUBACK)", result.Description ?? string.Empty);
    }

    [TestMethod]
    public async Task AFilterAddedAtRuntime_CountsOnlyAfterItsOwnSuback()
    {
        // Timeseries.Alerts subscribes again on every rule refresh. The filter the broker already
        // granted stays granted; the new one is not, until its own SUBACK says so.
        var client = new Mock<IManagedMqttClient>();
        var readiness = Wired(client);
        readiness.MarkRequested(Topic);
        await RaiseSubackAsync(client, (Topic, MqttClientSubscribeResultCode.GrantedQoS1));

        readiness.MarkRequested(Topic, Other);
        var beforeItsSuback = await CheckAsync(readiness);
        await RaiseSubackAsync(client, (Other, MqttClientSubscribeResultCode.GrantedQoS1));
        var afterItsSuback = await CheckAsync(readiness);

        Assert.AreEqual(HealthStatus.Unhealthy, beforeItsSuback.Status);
        Assert.Contains($"'{Other}' (no SUBACK)", beforeItsSuback.Description ?? string.Empty);
        Assert.Contains("1 of 2", beforeItsSuback.Description ?? string.Empty,
            "the filter granted before the refresh still counts");
        Assert.AreEqual(HealthStatus.Healthy, afterItsSuback.Status);
    }

    [TestMethod]
    public async Task AnUnsuback_WithdrawsTheGrant()
    {
        var client = new Mock<IManagedMqttClient>();
        var readiness = Wired(client);
        readiness.MarkRequested(Topic);
        await RaiseSubackAsync(client, (Topic, MqttClientSubscribeResultCode.GrantedQoS1));

        var unsuback = new MqttClientUnsubscribeResult(
            2, [new MqttClientUnsubscribeResultItem(Topic, MqttClientUnsubscribeResultCode.Success)], string.Empty, []);
        await client.RaiseAsync(c => c.SubscriptionsChangedAsync += null, new SubscriptionsChangedEventArgs([], [unsuback]));

        var result = await CheckAsync(readiness);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status,
            "the broker no longer delivers on a filter it has unsubscribed, whatever it granted before");
        Assert.IsNull(readiness.GetResultCode(Topic));
    }

    [TestMethod]
    public async Task AnEmptySet_IsHealthy_BecauseThereIsNothingToReceive()
    {
        // Timeseries.Alerts with no rules subscribes to nothing, and that is its whole job done. An
        // empty set is a statement; never calling MarkRequested is not one.
        var readiness = new MqttSubscriptionReadiness();
        readiness.MarkRequested();

        var result = await CheckAsync(readiness);

        Assert.AreEqual(HealthStatus.Healthy, result.Status);
        Assert.Contains("nothing to receive", result.Description ?? string.Empty);
    }

    [TestMethod]
    public async Task AFault_OutranksTheBrokersAnswer_AndMarkRequestedClearsIt()
    {
        var client = new Mock<IManagedMqttClient>();
        var readiness = Wired(client);
        readiness.MarkRequested(Topic);
        await RaiseSubackAsync(client, (Topic, MqttClientSubscribeResultCode.GrantedQoS1));

        readiness.MarkFaulted("the handler threw");
        var faulted = await CheckAsync(readiness);
        readiness.MarkRequested(Topic);
        var recovered = await CheckAsync(readiness);

        Assert.AreEqual(HealthStatus.Unhealthy, faulted.Status,
            "a granted subscription feeds nothing to a worker that stopped");
        Assert.Contains("the handler threw", faulted.Description ?? string.Empty);
        Assert.AreEqual(HealthStatus.Healthy, recovered.Status,
            "the broker's grant still stands, so a worker that asks for the same filter again is ready");
    }

    [TestMethod]
    public void TheLastMarkWins_BetweenTheSubackPathAndTheClientSideMark()
    {
        var readiness = new MqttSubscriptionReadiness();

        readiness.MarkRequested(Topic);
        Assert.IsNotNull(readiness.RequestedTopics);
        Assert.AreEqual(Topic, readiness.RequestedTopics[0]);
        Assert.IsNull(readiness.SubscribedTopic);

        readiness.MarkSubscribed(Topic);
        Assert.IsNull(readiness.RequestedTopics, "MarkSubscribed returns to the client-side mark");
        Assert.AreEqual(Topic, readiness.SubscribedTopic);

        readiness.MarkFaulted("stopped");
        Assert.IsNull(readiness.RequestedTopics, "a faulted worker has asked for nothing");
        Assert.IsNull(readiness.SubscribedTopic);
    }

    private static MqttSubscriptionReadiness Wired(Mock<IManagedMqttClient> client)
    {
        var readiness = new MqttSubscriptionReadiness();
        client.Object.SubscriptionsChangedAsync += readiness.HandleSubscriptionsChangedAsync;
        return readiness;
    }

    private static Task RaiseSubackAsync(
        Mock<IManagedMqttClient> client, params (string Topic, MqttClientSubscribeResultCode Code)[] answers)
    {
        var items = answers
            .Select(answer => new MqttClientSubscribeResultItem(new MqttTopicFilter { Topic = answer.Topic }, answer.Code))
            .ToList();
        var suback = new MqttClientSubscribeResult(1, items, string.Empty, []);
        return client.RaiseAsync(c => c.SubscriptionsChangedAsync += null, new SubscriptionsChangedEventArgs([suback], []));
    }

    private Task<HealthCheckResult> CheckAsync(MqttSubscriptionReadiness readiness) =>
        new MqttSubscriptionHealthCheck(readiness).CheckHealthAsync(Context, TestContext.CancellationToken);
}
