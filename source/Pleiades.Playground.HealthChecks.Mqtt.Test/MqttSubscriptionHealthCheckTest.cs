using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Pleiades.Playground.HealthChecks.Mqtt.Test;

/// <summary>
/// The gap this check exists for: <c>AddMqtt()</c> reports
/// <c>IManagedMqttClient.IsConnected</c>, which is true from the MQTT CONNECT onwards — before any
/// subscription exists. MQTT delivers nothing to a client that subscribes afterwards, so a service
/// whose whole job is a subscription reported itself healthy while receiving nothing.
/// </summary>
/// <remarks>
/// Every service that subscribes to MQTT has this gap. That is why the check lives in this package
/// rather than in one of them.
/// </remarks>
[TestClass]
public sealed class MqttSubscriptionHealthCheckTest
{
    private static readonly HealthCheckContext Context = new();

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task BeforeTheSubscriptionExists_ItIsUnhealthy()
    {
        var check = new MqttSubscriptionHealthCheck(new MqttSubscriptionReadiness());

        var result = await check.CheckHealthAsync(Context, TestContext.CancellationToken)
            .ConfigureAwait(false);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status,
            "a consumer that has not subscribed receives nothing, and reporting it healthy is what " +
            "makes `depends_on: service_healthy` mean less than it looks");
    }

    [TestMethod]
    public async Task OnceSubscribed_ItIsHealthyAndNamesTheTopic()
    {
        var readiness = new MqttSubscriptionReadiness();
        readiness.MarkSubscribed("machines/+/events/notifications");

        var result = await new MqttSubscriptionHealthCheck(readiness)
            .CheckHealthAsync(Context, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.AreEqual(HealthStatus.Healthy, result.Status);
        Assert.Contains("machines/+/events/notifications", result.Description ?? string.Empty,
            "the topic belongs in the payload: a wrong configuration is otherwise indistinguishable " +
            "from a broker that never delivers");
    }

    [TestMethod]
    public async Task WhenTheWorkerFaults_ItIsUnhealthyAndSaysWhy()
    {
        // The half a process-liveness probe cannot see. A BackgroundService whose ExecuteAsync returns
        // leaves the host running: alive, answering, consuming nothing.
        var readiness = new MqttSubscriptionReadiness();
        readiness.MarkSubscribed("machines/+/events/notifications");
        readiness.MarkFaulted("the broker refused the subscription");

        var result = await new MqttSubscriptionHealthCheck(readiness)
            .CheckHealthAsync(Context, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.AreEqual(HealthStatus.Unhealthy, result.Status);
        Assert.Contains("the broker refused the subscription", result.Description ?? string.Empty,
            "the reason has to reach the payload, or an operator sees only that something is wrong");
    }

    [TestMethod]
    public async Task AfterAFault_MarkSubscribed_MakesItHealthyAgain()
    {
        // THE DIRECTION NOTHING PINNED. MarkFaulted cleans up after
        // MarkSubscribed; until now the reverse did not, so a recovered worker stayed Unhealthy for
        // the process lifetime and the one call an author would reach for to fix that was a no-op.
        // The recommended worker rethrows and never gets here - but a managed client that reconnects
        // and re-subscribes does, and this package is aimed at many consumers, not at one.
        var readiness = new MqttSubscriptionReadiness();
        readiness.MarkSubscribed("machines/+/events/notifications");
        readiness.MarkFaulted("the broker dropped the connection");

        readiness.MarkSubscribed("machines/+/events/notifications");

        var result = await new MqttSubscriptionHealthCheck(readiness)
            .CheckHealthAsync(Context, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.AreEqual(HealthStatus.Healthy, result.Status,
            "a service that has re-subscribed is consuming, and reporting it Unhealthy forever is a " +
            "restart loop for a container that has already recovered");
        Assert.Contains("machines/+/events/notifications", result.Description ?? string.Empty);
    }

    [TestMethod]
    public void TheTwoMarksAreAbsoluteStateAssertions_NotEvents()
    {
        // The contract of the PUBLIC type, independent of the internal check that reads it: each mark
        // states what is true now, and the last one wins in either direction. The write order inside
        // MarkSubscribed (topic first, then the fault) is what keeps a concurrent CheckHealthAsync -
        // which reads Fault before SubscribedTopic - on the specific message rather than a
        // half-applied "not subscribed yet"; it cannot be asserted from here, only stated.
        var readiness = new MqttSubscriptionReadiness();

        readiness.MarkSubscribed("t");
        Assert.IsNull(readiness.Fault);

        readiness.MarkFaulted("stopped");
        Assert.IsNull(readiness.SubscribedTopic, "a faulted worker is not subscribed to anything");
        Assert.AreEqual("stopped", readiness.Fault);

        readiness.MarkSubscribed("t");
        Assert.IsNull(readiness.Fault, "MarkSubscribed clears the fault - see AfterAFault_... for why");
        Assert.AreEqual("t", readiness.SubscribedTopic);
    }

    [TestMethod]
    public void AddMqttSubscription_RegistersTheReadinessSingletonWithoutReplacingOne()
    {
        // THE TRAP THIS PINS. A consumer usually registers the readiness object itself, because its
        // worker is constructed with it - and then calls AddMqttSubscription(). With AddSingleton the
        // check would resolve a SECOND instance that nothing ever marks, and the service would never
        // report healthy. TryAddSingleton is what makes the order of the two calls irrelevant.
        var mine = new MqttSubscriptionReadiness();
        var services = new ServiceCollection();
        services.AddSingleton(mine);
        services.AddHealthChecks().AddMqttSubscription();

        // Asserted on the descriptors rather than on a built provider: the registration semantics are
        // the subject, and this needs no reference to the DI implementation package.
        var registered = services.Where(d => d.ServiceType == typeof(MqttSubscriptionReadiness)).ToList();

        Assert.HasCount(1, registered,
            "TryAddSingleton must not add a second registration beside the consumer's");
        Assert.AreSame(mine, registered[0].ImplementationInstance,
            "the check must read the very object the worker marks, not a second one");
    }

    [TestMethod]
    public void AddMqttSubscription_RegistersOneWhenTheConsumerDidNot()
    {
        var services = new ServiceCollection();
        services.AddHealthChecks().AddMqttSubscription();

        var registered = services.Where(d => d.ServiceType == typeof(MqttSubscriptionReadiness)).ToList();

        Assert.HasCount(1, registered,
            "a consumer that only injects it into its worker must not have to register it as well");
        Assert.AreEqual(typeof(MqttSubscriptionReadiness), registered[0].ImplementationType);
        Assert.AreEqual(ServiceLifetime.Singleton, registered[0].Lifetime,
            "two instances would mean the check reads one the worker never marks");
    }
}
