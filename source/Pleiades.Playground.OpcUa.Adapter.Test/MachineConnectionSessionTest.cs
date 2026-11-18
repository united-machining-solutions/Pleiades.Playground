using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Opc.Ua;
using Opc.Ua.Client;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

/// <summary>
/// A machine on a session of the stack: it subscribes its values and, in a subscription of their own, its alarms,
/// catches up with ConditionRefresh, reports alarms and the end of a refresh, and leaves the session on detach.
/// </summary>
[TestClass]
public class MachineConnectionSessionTest
{
    private const string Namespace = "urn:test";

    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task Attach_alarms_refresh_and_detach()
    {
        using var directory = new TemporaryDirectory();
        var registration = new MachineRegistration
        {
            SerialNumber = "A1121O0001",
            Endpoint = new EndpointRegistration { Url = "opc.tcp://machine:4840" },
            Elements = [new ElementRegistration { Path = "State.FeedOverride", Kind = ValueKind.Number, Unit = "one", Node = $"nsu={Namespace};s=FeedOverride" }],
            Alerts = new AlertRegistration { EventType = $"nsu={Namespace};i=5000" },
        };
        var output = new Mock<IMachineOutput>();
        var alerts = new List<(AlertChange Change, IReadOnlyList<OpenAlert> Open)>();
        output.Setup(o => o.AlertAsync(It.IsAny<AlertChange>(), It.IsAny<IReadOnlyList<OpenAlert>>()))
            .Callback<AlertChange, IReadOnlyList<OpenAlert>>((change, open) =>
            {
                lock (alerts)
                {
                    alerts.Add((change, open));
                }
            })
            .Returns(Task.CompletedTask);
        var outputs = new Mock<IMachineOutputFactory>();
        outputs.Setup(factory => factory.Create(It.IsAny<MachineRegistration>(), It.IsAny<IReadOnlyList<OpenAlert>>())).Returns(output.Object);

        var namespaces = new NamespaceTable();
        var index = (ushort)namespaces.GetIndexOrAppend(Namespace);
        var subscriptions = new List<Subscription>();
        uint nextId = 0;
        var session = new Mock<ISession>();
        session.SetupGet(s => s.NamespaceUris).Returns(namespaces);
#pragma warning disable CS0618 // The classic subscription, as the adapter uses it.
        session.SetupGet(s => s.DefaultSubscription).Returns(new Subscription());
#pragma warning restore CS0618
        // As the session of the stack does: it adds the subscription and becomes its session.
        session.Setup(s => s.AddSubscription(It.IsAny<Subscription>()))
            .Callback<Subscription>(subscription =>
            {
                subscriptions.Add(subscription);
                typeof(Subscription).GetProperty(nameof(Subscription.Session))!.SetValue(subscription, session.Object);
            })
            .Returns(true);
        session.Setup(s => s.CreateSubscriptionAsync(It.IsAny<RequestHeader>(), It.IsAny<double>(), It.IsAny<uint>(), It.IsAny<uint>(), It.IsAny<uint>(), It.IsAny<bool>(), It.IsAny<byte>(), It.IsAny<CancellationToken>()))
            .Returns(() => new ValueTask<CreateSubscriptionResponse>(new CreateSubscriptionResponse
            {
                ResponseHeader = new ResponseHeader(),
                SubscriptionId = ++nextId,
                RevisedPublishingInterval = 1000,
                RevisedLifetimeCount = 30,
                RevisedMaxKeepAliveCount = 10,
            }));
        session.Setup(s => s.SetPublishingModeAsync(It.IsAny<RequestHeader>(), It.IsAny<bool>(), It.IsAny<ArrayOf<uint>>(), It.IsAny<CancellationToken>()))
            .Returns((RequestHeader _, bool _, ArrayOf<uint> ids, CancellationToken _) =>
                new ValueTask<SetPublishingModeResponse>(new SetPublishingModeResponse
                {
                    ResponseHeader = new ResponseHeader(),
                    Results = ids.ToArray().Select(_ => (StatusCode)StatusCodes.Good).ToArray(),
                }));
        session.Setup(s => s.CreateMonitoredItemsAsync(It.IsAny<RequestHeader>(), It.IsAny<uint>(), It.IsAny<TimestampsToReturn>(), It.IsAny<ArrayOf<MonitoredItemCreateRequest>>(), It.IsAny<CancellationToken>()))
            .Returns((RequestHeader _, uint _, TimestampsToReturn _, ArrayOf<MonitoredItemCreateRequest> requests, CancellationToken _) =>
                new ValueTask<CreateMonitoredItemsResponse>(new CreateMonitoredItemsResponse
                {
                    ResponseHeader = new ResponseHeader(),
                    Results = requests.ToArray().Select(request => new MonitoredItemCreateResult
                    {
                        StatusCode = StatusCodes.Good,
                        MonitoredItemId = request.RequestedParameters.ClientHandle,
                        RevisedSamplingInterval = 1000,
                        RevisedQueueSize = 10,
                    }).ToArray(),
                }));
        var calls = new List<CallMethodRequest>();
        session.Setup(s => s.CallAsync(It.IsAny<RequestHeader>(), It.IsAny<ArrayOf<CallMethodRequest>>(), It.IsAny<CancellationToken>()))
            .Callback<RequestHeader, ArrayOf<CallMethodRequest>, CancellationToken>((_, requests, _) => calls.AddRange(requests.ToArray()))
            .Returns(new ValueTask<CallResponse>(new CallResponse
            {
                ResponseHeader = new ResponseHeader(),
                Results = new[] { new CallMethodResult { StatusCode = StatusCodes.Good } },
            }));
        session.Setup(s => s.RemoveSubscriptionAsync(It.IsAny<Subscription>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        var endpoint = new Mock<IEndpointSession>();
        endpoint.SetupGet(e => e.Session).Returns(session.Object);
        var connection = new MachineConnection(
            registration, outputs.Object, new AlertStore(directory.Path), TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(1), NullLogger.Instance);

        await connection.AttachAsync(endpoint.Object, TestContext.CancellationToken);

        Assert.HasCount(2, subscriptions, "Values and alarms each have a subscription of their own.");
        Assert.HasCount(1, calls, "ConditionRefresh catches up the alarms that stand.");
        Assert.AreEqual(MethodIds.ConditionType_ConditionRefresh, calls[0].MethodId);
        Assert.AreEqual("Running", connection.Status.State);
        output.Verify(o => o.ReachedAsync(), Times.Once);

        // An alarm comes up, and the refresh after a reconnect no longer lists it: it went while nobody listened.
        var item = subscriptions[1].MonitoredItems.Single();
        var alarmType = new NodeId(5000u, index);
        var condition = new NodeId("Coolant", index);
        item.SaveValueInCache(Event(alarmType, condition, active: true));
        await WaitFor(() => Count(alerts) == 1);
        Assert.AreEqual(AlertAction.Raised, alerts[0].Change.Action);
        Assert.AreEqual("Coolant low", alerts[0].Change.Alert.Message);
        Assert.AreEqual("Failure", alerts[0].Change.Alert.Severity);
        Assert.HasCount(1, alerts[0].Open);
        item.SaveValueInCache(Event(ObjectTypeIds.RefreshStartEventType, null, active: false));
        item.SaveValueInCache(Event(ObjectTypeIds.RefreshEndEventType, null, active: false));
        await WaitFor(() => Count(alerts) == 2);
        Assert.AreEqual(AlertAction.Cleared, alerts[1].Change.Action);
        Assert.AreEqual(alerts[0].Change.Alert.Id, alerts[1].Change.Alert.Id, "Raised and cleared share the id of the occurrence.");
        Assert.IsEmpty(alerts[1].Open);

        await connection.DetachAsync(endpoint.Object);

        session.Verify(s => s.RemoveSubscriptionAsync(It.IsAny<Subscription>(), It.IsAny<CancellationToken>()), Times.Exactly(2),
            "Both subscriptions leave the session, which goes on for the other machines.");
        Assert.AreEqual("Shutdown", connection.Status.State);
        output.Verify(o => o.LostAsync(), Times.Never, "A machine that leaves on purpose is no CommunicationFault.");
    }

    // The fields in the order the alarm filter selects them: type, time, message, severity, condition, name,
    // active, source.
    private static EventFieldList Event(NodeId type, NodeId? condition, bool active) => new()
    {
        EventFields = new[]
        {
            new Variant(type),
            new Variant(DateTime.UtcNow),
            new Variant(new LocalizedText("Coolant low")),
            new Variant((ushort)800),
            new Variant(condition ?? NodeId.Null),
            new Variant("Coolant"),
            new Variant(active),
            new Variant(NodeId.Null),
        },
    };

    private static int Count<T>(List<T> list)
    {
        lock (list)
        {
            return list.Count;
        }
    }

    private async Task WaitFor(Func<bool> done)
    {
        for (var waited = 0; !done() && waited < 100; waited++)
        {
            await Task.Delay(20, TestContext.CancellationToken);
        }

        Assert.IsTrue(done());
    }
}
