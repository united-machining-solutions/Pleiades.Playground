using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Bend.Protocol.Transport;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.Bend.Adapter.Test;

/// <summary>
/// The adapter against telegram files the machine side of the protocol writes, with a publisher that only records.
/// </summary>
[TestClass]
public sealed class AdapterWorkerTest
{
    /// <summary>Records every call: the name of the call and what came with it.</summary>
    private sealed class RecordingPublisher : IPublisher
    {
        public List<(string Call, IReadOnlyList<Publication> Publications)> Calls { get; } = [];

        public IEnumerable<Publication> Published => Calls.SelectMany(c => c.Publications);

        public Task StartAsync() => Record("Start");

        public Task ReachedAsync(IReadOnlyList<Publication> publications) => Record("Reached", publications);

        public Task SaidAsync(IReadOnlyList<Publication> publications) => Record("Said", publications);

        public Task LostAsync() => Record("Lost");

        public Task HeartbeatAsync() => Record("Heartbeat");

        public Task ShutdownAsync() => Record("Shutdown");

        private Task Record(string call, IReadOnlyList<Publication>? publications = null)
        {
            Calls.Add((call, publications ?? []));
            return Task.CompletedTask;
        }
    }

    private string _directory = null!;
    private FixedTime _time = null!;
    private RciTelegramWriter _machine = null!;
    private RecordingPublisher _publisher = null!;

    [TestInitialize]
    public void Initialize()
    {
        _directory = Directory.CreateTempSubdirectory("bend-adapter-").FullName;
        // The adapter compares the real write time of a file with its clock, so the clock starts now.
        _time = new FixedTime(DateTimeOffset.UtcNow);
        _machine = new RciTelegramWriter(new RciChannelOptions { Directory = _directory }, _time);
        _publisher = new RecordingPublisher();
    }

    [TestCleanup]
    public void Cleanup() => Directory.Delete(_directory, recursive: true);

    private AdapterWorker Worker()
    {
        var config = new Config
        {
            SerialNumber = "B-01",
            ExchangeDirectory = _directory,
            MqttDestination = new MqttConfig { ConnectionString = "mqtt://localhost:1883" },
        };
        return new AdapterWorker(
            Options.Create(config),
            new RciTelegramParser(TimeZoneInfo.Utc),
            new RciExchangeDirectory(_directory, config.MachineFilePrefix),
            new BendTranslator(config.Identity, _time),
            _publisher,
            _time,
            NullLogger<AdapterWorker>.Instance);
    }

    /// <summary>The files are older than the settle time of the adapter, as files of a running machine are.</summary>
    private void LetFilesSettle() => _time.Advance(TimeSpan.FromSeconds(1));

    private string[] CallNames() => [.. _publisher.Calls.Select(c => c.Call)];

    [TestMethod]
    public async Task The_start_begins_the_connect_sequence_and_reaches_the_machine()
    {
        using var worker = Worker();
        await worker.StartUpAsync();

        CollectionAssert.AreEqual(new[] { "Start", "Heartbeat", "Reached" }, CallNames());
        Assert.IsNull(BendTranslatorTest.ValueAt(_publisher.Published, Paths.ActiveAlerts), "Without a file nothing says whether an alert stands.");
    }

    [TestMethod]
    public async Task A_new_telegram_is_read_once_and_published()
    {
        using var worker = Worker();
        await worker.StartUpAsync();
        _publisher.Calls.Clear();

        _machine.SendOperatingState(RciOperatingState.Fault, "4711", "Light curtain");
        LetFilesSettle();
        await worker.ReadNewFilesAsync();
        await worker.ReadNewFilesAsync();

        Assert.HasCount(1, _publisher.Calls);
        Assert.AreEqual("OutOfService", (string?)BendTranslatorTest.ValueAt(_publisher.Published, Paths.Status)!["MachineryItemState"]);
        var raised = _publisher.Published.OfType<EventPublication>().Single();
        Assert.AreEqual(Paths.AlertRaised, raised.Type);
        Assert.AreEqual("RCI-4711", (string?)raised.Data["ErrorCode"]);
    }

    [TestMethod]
    public async Task Files_that_were_there_at_the_start_give_only_their_newest_values_and_no_event()
    {
        _machine.SendOperatingState(RciOperatingState.Fault, "4711", "Light curtain");
        _machine.SendOperatingState(RciOperatingState.Running);
        LetFilesSettle();

        using var worker = Worker();
        await worker.StartUpAsync();

        Assert.AreEqual(1, _publisher.Published.OfType<ValuePublication>().Count(p => p.Path == Paths.Status));
        Assert.AreEqual("Executing", (string?)BendTranslatorTest.ValueAt(_publisher.Published, Paths.Status)!["MachineryItemState"]);
        Assert.IsFalse(_publisher.Published.OfType<EventPublication>().Any());
    }

    [TestMethod]
    public async Task A_machine_that_was_offline_at_the_start_is_not_reached()
    {
        _machine.SendOperatingState(RciOperatingState.Offline);
        LetFilesSettle();

        using var worker = Worker();
        await worker.StartUpAsync();

        CollectionAssert.AreEqual(new[] { "Start", "Heartbeat", "Said", "Lost" }, CallNames());
    }

    [TestMethod]
    public async Task Offline_is_lost_and_the_next_operating_state_reaches_the_machine_again()
    {
        using var worker = Worker();
        await worker.StartUpAsync();
        _publisher.Calls.Clear();

        _machine.SendOperatingState(RciOperatingState.Offline);
        LetFilesSettle();
        await worker.ReadNewFilesAsync();
        _machine.SendOperatingState(RciOperatingState.Idle);
        LetFilesSettle();
        await worker.ReadNewFilesAsync();

        CollectionAssert.AreEqual(new[] { "Said", "Lost", "Reached" }, CallNames());
    }

    [TestMethod]
    public async Task The_heartbeat_is_the_one_of_the_publisher()
    {
        using var worker = Worker();
        await worker.HeartbeatAsync();

        CollectionAssert.AreEqual(new[] { "Heartbeat" }, CallNames());
    }
}
