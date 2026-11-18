using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Cutting.Protocol.Transport;

namespace Pleiades.Playground.Cutting.Adapter.Test;

/// <summary>
/// The adapter against a machine that the test plays through the telegram files.
/// </summary>
[TestClass]
public sealed class AdapterWorkerTest
{
    private string _directory = string.Empty;

    public TestContext TestContext { get; set; } = default!;

    [TestInitialize]
    public void CreateDirectory()
    {
        _directory = Path.Combine(Path.GetTempPath(), "cutting-adapter-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_directory);
    }

    [TestCleanup]
    public void DeleteDirectory()
    {
        Directory.Delete(_directory, recursive: true);
    }

    [TestMethod]
    public async Task AMachineThatAnswers_IsReached_TheAdapterBeats_AndItsNotificationsArePublished()
    {
        var publisher = new RecordingPublisher();
        using var machine = Channel(CuttingRole.Machine);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var answering = AnswerAsync(machine, cancel.Token);
        using var worker = Worker(publisher, out _);

        await worker.StartAsync(cancel.Token);
        await publisher.WaitForAsync(Call.Heartbeat);
        await publisher.WaitForAsync(Call.Reached);
        await machine.SendAsync([CuttingNotification.Create(CuttingNotifications.StartNcp, "1", "PROG_A", "", "", "1", "", "", "0")], cancel.Token);
        await publisher.WaitForAsync(p => p is ValuePublication { Path: var path, Value: var value } && path == ProgramPath && (string?)value == "PROG_A");
        await worker.StopAsync(CancellationToken.None);
        for (var i = 0; i < 250 && !_requests.Contains(CuttingCommands.Disconnect); i++)
        {
            await Task.Delay(20, TestContext.CancellationToken);
        }

        await cancel.CancelAsync();
        await answering;

        var calls = publisher.Calls;
        Assert.AreEqual(Call.Started, calls[0], "The connect sequence of the binding comes first.");
        Assert.AreEqual(Call.Lost, calls[1], "Until the machine answers, it is not reached.");
        Assert.AreEqual(Call.Shutdown, calls[^1], "Shutdown is the last message.");
        Assert.IsTrue(publisher.Has(p => p is ValuePublication { Path: Paths.Status, Value: null }), "The state is not known before the machine says it.");
        Assert.IsTrue(publisher.Has(p => p is ValuePublication { Path: Paths.ChannelState, Value: var v } && (string?)v == "Active"));
        Assert.IsTrue(_requests.Contains(CuttingCommands.MachineInfo), "The adapter asks MACHINFO after connecting.");
        Assert.IsTrue(_requests.Contains(CuttingCommands.Disconnect), "The adapter disconnects when it stops.");
    }

    [TestMethod]
    public async Task AHaltOfTheProgram_IsPublishedAfterTheHold()
    {
        var publisher = new RecordingPublisher();
        using var machine = Channel(CuttingRole.Machine);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var answering = AnswerAsync(machine, cancel.Token);
        using var worker = Worker(publisher, out _);
        await worker.StartAsync(cancel.Token);
        await publisher.WaitForAsync(Call.Reached);

        await machine.SendAsync(
        [
            CuttingNotification.Create(CuttingNotifications.StartNcp, "1", "PROG_A", "", "", "1", "", "", "0"),
            CuttingNotification.Create(CuttingNotifications.MachineStopped, "1", "PROG_A", "", "2"),
        ], cancel.Token);
        await publisher.WaitForAsync(p => p is ValuePublication { Path: Paths.ChannelState, Value: var v } && (string?)v == "Interrupted");
        await worker.StopAsync(CancellationToken.None);
        await cancel.CancelAsync();
        await answering;

        Assert.IsTrue(publisher.Has(p => ItemState(p) == "NotExecuting"));
    }

    [TestMethod]
    public async Task AMachineThatSwitchesOff_IsNotAvailable_AndNotReached()
    {
        var publisher = new RecordingPublisher();
        using var machine = Channel(CuttingRole.Machine);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var answering = AnswerAsync(machine, cancel.Token);
        using var worker = Worker(publisher, out _);
        await worker.StartAsync(cancel.Token);
        await publisher.WaitForAsync(Call.Reached);

        await machine.SendAsync([CuttingNotification.Create(CuttingNotifications.ServerDisconnect)], cancel.Token);
        await publisher.WaitForAsync(p => ItemState(p) == "NotAvailable");
        await publisher.WaitForAsync(() => publisher.Calls.Count(c => c == Call.Lost) >= 2);
        await worker.StopAsync(CancellationToken.None);
        await cancel.CancelAsync();
        await answering;

        Assert.IsFalse(worker.Connected);
    }

    [TestMethod]
    public async Task AMachineThatAnnouncesItself_IsNotReachedUntilItAnswersAgain()
    {
        var publisher = new RecordingPublisher();
        using var machine = Channel(CuttingRole.Machine);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var answering = AnswerAsync(machine, cancel.Token);
        using var worker = Worker(publisher, out _);
        await worker.StartAsync(cancel.Token);
        await publisher.WaitForAsync(Call.Reached);

        await machine.SendAsync([CuttingNotification.Create(CuttingNotifications.ServerConnect)], cancel.Token);
        await publisher.WaitForAsync(() => publisher.Calls.Count(c => c == Call.Lost) >= 2);
        await publisher.WaitForAsync(() => publisher.Calls.Count(c => c == Call.Reached) >= 2);
        await worker.StopAsync(CancellationToken.None);
        await cancel.CancelAsync();
        await answering;

        var calls = publisher.Calls.Where(c => c is Call.Lost or Call.Reached).ToList();
        CollectionAssert.AreEqual(new[] { Call.Lost, Call.Reached, Call.Lost, Call.Reached }, calls.Take(4).ToArray(),
            "The announcement says the values are not current, until SRC9CONN is answered again.");
    }

    [TestMethod]
    public async Task AMachineThatDoesNotAnswer_IsNotReached_TheAdapterStillBeats_AndTheHostFileDoesNotGrow()
    {
        var publisher = new RecordingPublisher();
        using var worker = Worker(publisher, out var config);

        await worker.StartAsync(TestContext.CancellationToken);
        await Task.Delay(config.ReplyTimeout * 4, TestContext.CancellationToken);
        await worker.StopAsync(CancellationToken.None);

        Assert.DoesNotContain(Call.Reached, publisher.Calls);
        Assert.Contains(Call.Lost, publisher.Calls);
        Assert.Contains(Call.Heartbeat, publisher.Calls, "The heartbeat is the sign of life of the adapter, not of the machine.");
        var lines = await File.ReadAllLinesAsync(Path.Combine(_directory, "s1_to_m1.dat"), TestContext.CancellationToken);
        Assert.HasCount(1, lines, "One SRC9CONN waits for the machine, not one per try.");
    }

    private static readonly string ProgramPath = CuttingTranslatorTest.Identity.Signal(Paths.ActiveProgram);

    private static string? ItemState(Publication publication)
    {
        return publication is ValuePublication { Path: Paths.Status, Value: JsonObject status } ? (string?)status["MachineryItemState"] : null;
    }
    private readonly ConcurrentBag<string> _requests = [];

    /// <summary>Plays the machine: answers every request as a 2D laser with machine number 1 would.</summary>
    private async Task AnswerAsync(CuttingFileChannel machine, CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                foreach (var line in await machine.ReceiveAsync(cancellationToken))
                {
                    var request = (CuttingTelegram)CuttingTelegramParser.Parse(line);
                    _requests.Add(request.Command);
                    var reply = request.Command switch
                    {
                        CuttingCommands.Connect => CuttingTelegram.Reply(request, [.. CuttingSupport.Commands(CuttingMachineType.Laser2D)]),
                        CuttingCommands.MachineInfo => CuttingTelegram.Reply(request, "1", "0", "0"),
                        CuttingCommands.SystemTime => CuttingTelegram.Reply(request, "1", CuttingFormat.Timestamp(DateTime.Now), "0"),
                        _ => CuttingTelegram.Reply(request),
                    };
                    await machine.SendAsync([reply], cancellationToken);
                }

                await Task.Delay(10, cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            // The test is over.
        }
    }

    private AdapterWorker Worker(IPublisher publisher, out Config config)
    {
        config = new Config
        {
            SerialNumber = "L-01",
            ExchangeDirectory = _directory,
            ReplyTimeout = TimeSpan.FromMilliseconds(300),
            HeartbeatInterval = TimeSpan.FromSeconds(1),
            MqttDestination = new MqttConfig(),
        };
        var channel = Channel(CuttingRole.Host);
        var session = new CuttingHostSession(channel, TimeSpan.FromMilliseconds(10), NullLogger<CuttingHostSession>.Instance);
        var translator = new CuttingTranslator(CuttingTranslatorTest.Identity, TimeZoneInfo.Utc, TimeProvider.System, config.StateHold);
        return new AdapterWorker(channel, session, translator, publisher, Options.Create(config), NullLogger<AdapterWorker>.Instance);
    }

    private CuttingFileChannel Channel(CuttingRole role)
    {
        return new CuttingFileChannel(new CuttingChannelOptions
        {
            Directory = _directory,
            Role = role,
            RetryInterval = TimeSpan.FromMilliseconds(5),
        });
    }

    private enum Call
    {
        Started,
        Reached,
        Said,
        Lost,
        Heartbeat,
        Shutdown,
    }

    private sealed class RecordingPublisher : IPublisher
    {
        private readonly ConcurrentQueue<Publication> _published = new();
        private readonly ConcurrentQueue<Call> _calls = new();

        public IReadOnlyList<Call> Calls => [.. _calls];

        public Task StartAsync() => Record(Call.Started);

        public Task ReachedAsync(IReadOnlyList<Publication> publications) => Record(Call.Reached, publications);

        public Task SaidAsync(IReadOnlyList<Publication> publications) => publications.Count == 0 ? Task.CompletedTask : Record(Call.Said, publications);

        public Task LostAsync() => Record(Call.Lost);

        public Task HeartbeatAsync() => Record(Call.Heartbeat);

        public Task ShutdownAsync() => Record(Call.Shutdown);

        public bool Has(Func<Publication, bool> match) => _published.Any(match);

        public Task WaitForAsync(Func<Publication, bool> match) => WaitForAsync(() => Has(match));

        public Task WaitForAsync(Call call) => WaitForAsync(() => _calls.Contains(call));

        public async Task WaitForAsync(Func<bool> condition)
        {
            var deadline = DateTime.UtcNow.AddSeconds(10);
            while (!condition())
            {
                if (DateTime.UtcNow > deadline)
                {
                    Assert.Fail("Not published. Calls: " + string.Join(", ", _calls) + ". Published: " + string.Join(", ", _published));
                }

                await Task.Delay(20);
            }
        }

        private Task Record(Call call, IReadOnlyList<Publication> publications)
        {
            foreach (var publication in publications)
            {
                _published.Enqueue(publication);
            }

            return Record(call);
        }

        private Task Record(Call call)
        {
            _calls.Enqueue(call);
            return Task.CompletedTask;
        }
    }
}