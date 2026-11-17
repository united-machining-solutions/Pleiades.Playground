using System.Collections.Concurrent;
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
    public async Task AMachineThatAnswers_IsConnected_BeatsAndItsNotificationsArePublished()
    {
        var publisher = new RecordingPublisher();
        using var machine = Channel(CuttingRole.Machine);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var answering = AnswerAsync(machine, cancel.Token);
        using var worker = Worker(publisher, out _);

        await worker.StartAsync(cancel.Token);
        await publisher.WaitForAsync(p => p is NumberPublication { Path: Paths.Heartbeat });
        await machine.SendAsync([CuttingNotification.Create(CuttingNotifications.StartNcp, "1", "PROG_A", "", "", "1", "", "", "0")], cancel.Token);
        await publisher.WaitForAsync(p => p is TextPublication { Path: Paths.ActiveProgram, Value: "PROG_A" });
        await worker.StopAsync(CancellationToken.None);
        for (var i = 0; i < 250 && !_requests.Contains(CuttingCommands.Disconnect); i++)
        {
            await Task.Delay(20, TestContext.CancellationToken);
        }

        await cancel.CancelAsync();
        await answering;

        Assert.IsTrue(publisher.Has(p => p is TextPublication { Path: Paths.ConnectionState, Value: "Connected" }));
        Assert.IsTrue(publisher.Has(p => p is TextPublication { Path: Paths.OperationMode, Value: "None" }));
        Assert.IsTrue(publisher.Has(p => p is TextPublication { Path: Paths.ChannelState, Value: "Active" }));
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
        await publisher.WaitForAsync(p => p is TextPublication { Path: Paths.ConnectionState, Value: "Connected" });

        await machine.SendAsync(
        [
            CuttingNotification.Create(CuttingNotifications.StartNcp, "1", "PROG_A", "", "", "1", "", "", "0"),
            CuttingNotification.Create(CuttingNotifications.MachineStopped, "1", "PROG_A", "", "2"),
        ], cancel.Token);
        await publisher.WaitForAsync(p => p is TextPublication { Path: Paths.ChannelState, Value: "Interrupted" });
        await worker.StopAsync(CancellationToken.None);
        await cancel.CancelAsync();
        await answering;

        Assert.IsTrue(publisher.Has(p => p is TextPublication { Path: Paths.ItemState, Value: "NotExecuting" }));
    }

    [TestMethod]
    public async Task AMachineThatSwitchesOff_IsNotAvailable()
    {
        var publisher = new RecordingPublisher();
        using var machine = Channel(CuttingRole.Machine);
        using var cancel = CancellationTokenSource.CreateLinkedTokenSource(TestContext.CancellationToken);
        var answering = AnswerAsync(machine, cancel.Token);
        using var worker = Worker(publisher, out _);
        await worker.StartAsync(cancel.Token);
        await publisher.WaitForAsync(p => p is TextPublication { Path: Paths.ConnectionState, Value: "Connected" });

        await machine.SendAsync([CuttingNotification.Create(CuttingNotifications.ServerDisconnect)], cancel.Token);
        await publisher.WaitForAsync(p => p is TextPublication { Path: Paths.ItemState, Value: "NotAvailable" });
        await worker.StopAsync(CancellationToken.None);
        await cancel.CancelAsync();
        await answering;

        Assert.IsFalse(worker.Connected);
    }

    [TestMethod]
    public async Task AMachineThatDoesNotAnswer_StaysDisconnected_AndTheHostFileDoesNotGrow()
    {
        var publisher = new RecordingPublisher();
        using var worker = Worker(publisher, out var config);

        await worker.StartAsync(TestContext.CancellationToken);
        await Task.Delay(config.ReplyTimeout * 4, TestContext.CancellationToken);
        await worker.StopAsync(CancellationToken.None);

        Assert.IsFalse(publisher.Has(p => p is TextPublication { Value: "Connected" }));
        Assert.IsTrue(publisher.Has(p => p is TextPublication { Path: Paths.ConnectionState, Value: "Disconnected" }));
        var lines = await File.ReadAllLinesAsync(Path.Combine(_directory, "s1_to_m1.dat"), TestContext.CancellationToken);
        Assert.HasCount(1, lines, "One SRC9CONN waits for the machine, not one per try.");
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
        var translator = new CuttingTranslator(TimeZoneInfo.Utc, TimeProvider.System, config.StateHold);
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

    private sealed class RecordingPublisher : IPublisher
    {
        private readonly ConcurrentQueue<Publication> _published = new();

        public Task PublishAsync(IReadOnlyList<Publication> publications)
        {
            foreach (var publication in publications)
            {
                _published.Enqueue(publication);
            }

            return Task.CompletedTask;
        }

        public bool Has(Func<Publication, bool> match) => _published.Any(match);

        public async Task WaitForAsync(Func<Publication, bool> match)
        {
            var deadline = DateTime.UtcNow.AddSeconds(10);
            while (!Has(match))
            {
                if (DateTime.UtcNow > deadline)
                {
                    Assert.Fail("Not published. Published: " + string.Join(", ", _published));
                }

                await Task.Delay(20);
            }
        }
    }
}
