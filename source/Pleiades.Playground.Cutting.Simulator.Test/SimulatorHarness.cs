using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Cutting.Protocol.Transport;
using Pleiades.Playground.Cutting.Simulator.Machine;
using Pleiades.Playground.Cutting.Simulator.Machine.Variants;

namespace Pleiades.Playground.Cutting.Simulator.Test;

/// <summary>
/// One simulated machine on a folder of its own, with a host channel that plays the other side.
/// </summary>
internal sealed class SimulatorHarness : IAsyncDisposable
{
    private readonly string _directory;
    private readonly CuttingFileChannel _machineChannel;
    private readonly CuttingLinkService _linkService;
    private readonly ProductionRunner _runner;
    private readonly List<CuttingMessage> _received = [];
    private long _transaction;

    private SimulatorHarness(CuttingMachineType type, bool autoRun, bool stateBeforeProgram)
    {
        _directory = Path.Combine(Path.GetTempPath(), "cutting-sim-" + Guid.NewGuid().ToString("N"));
        var config = Options.Create(new Config
        {
            MachineType = type,
            MachineNumber = "M1",
            ExchangeDirectory = _directory,
            AutoRun = autoRun,
            StateBeforeProgram = stateBeforeProgram,
            TimeScale = 0.01,
            MinProgramDuration = TimeSpan.FromSeconds(1),
            MaxProgramDuration = TimeSpan.FromSeconds(2),
            PollInterval = TimeSpan.FromMilliseconds(20),
            StatePath = string.Empty,
        });

        IMachineVariant variant = type switch
        {
            CuttingMachineType.Tube => new TubeVariant(),
            CuttingMachineType.Punch => new PunchVariant(),
            _ => new LaserVariant(),
        };

        var options = new CuttingChannelOptions
        {
            Directory = _directory,
            Role = CuttingRole.Machine,
            RetryInterval = TimeSpan.FromMilliseconds(5),
        };
        _machineChannel = new CuttingFileChannel(options);
        Host = new CuttingFileChannel(options with { Role = CuttingRole.Host });

        Machine = new CuttingMachine(config, variant);
        Log = new TelegramLog(TimeProvider.System);
        var link = new CuttingLink(_machineChannel, Machine, Log, TimeProvider.System, NullLogger<CuttingLink>.Instance);
        Actions = new MachineActions(Machine, link);
        Dispatcher = new CommandDispatcher(Machine, Actions, link, config);
        _linkService = new CuttingLinkService(_machineChannel, Machine, Actions, Dispatcher, Log, config, NullLogger<CuttingLinkService>.Instance);
        _runner = new ProductionRunner(Machine, link, Actions, config, NullLogger<ProductionRunner>.Instance);
    }

    public CuttingMachine Machine { get; }

    public MachineActions Actions { get; }

    public CommandDispatcher Dispatcher { get; }

    public TelegramLog Log { get; }

    public CuttingFileChannel Host { get; }

    /// <summary>Everything the host has read so far.</summary>
    public IReadOnlyList<CuttingMessage> Received => _received;

    public static async Task<SimulatorHarness> StartAsync(CuttingMachineType type, bool autoRun = false, bool stateBeforeProgram = false)
    {
        var harness = new SimulatorHarness(type, autoRun, stateBeforeProgram);
        await harness._linkService.StartAsync(CancellationToken.None);
        await harness._runner.StartAsync(CancellationToken.None);
        await harness.WaitForAsync(m => m is CuttingNotification { Name: CuttingNotifications.ServerConnect });
        return harness;
    }

    /// <summary>Sends a request as the host and waits for its last reply.</summary>
    public async Task<CuttingTelegram> RequestAsync(string command, params IReadOnlyList<string> fields)
    {
        var request = CuttingTelegram.Request(command, ++_transaction, fields);
        await Host.SendAsync([request]);
        return (CuttingTelegram)await WaitForAsync(m =>
            m is CuttingTelegram { Kind: CuttingTelegramKind.Last } t && t.TransactionNumber == request.TransactionNumber);
    }

    /// <summary>Connects as host, so that the machine sends its notifications.</summary>
    public Task<CuttingTelegram> ConnectAsync() => RequestAsync(CuttingCommands.Connect, "2.1.0");

    /// <summary>Reads the machine file until a message matches, or fails after the timeout.</summary>
    public async Task<CuttingMessage> WaitForAsync(Func<CuttingMessage, bool> match, int timeoutSeconds = 15)
    {
        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);
        var seen = 0;
        while (DateTime.UtcNow < deadline)
        {
            for (; seen < _received.Count; seen++)
            {
                if (match(_received[seen]))
                {
                    return _received[seen];
                }
            }

            foreach (var line in await Host.ReceiveAsync())
            {
                _received.Add(CuttingTelegramParser.Parse(line));
            }

            if (seen == _received.Count)
            {
                await Task.Delay(20);
            }
        }

        Assert.Fail("The machine did not send what the test waits for. It sent:" + Environment.NewLine +
            string.Join(Environment.NewLine, _received.Select(m => m.Format())));
        throw new InvalidOperationException();
    }

    /// <summary>Waits for a notification with the given name.</summary>
    public async Task<CuttingNotification> NotificationAsync(string name, Func<CuttingNotification, bool>? match = null)
    {
        return (CuttingNotification)await WaitForAsync(m =>
            m is CuttingNotification n && n.Name == name && (match?.Invoke(n) ?? true));
    }

    public async ValueTask DisposeAsync()
    {
        await _runner.StopAsync(CancellationToken.None);
        await _linkService.StopAsync(CancellationToken.None);
        _runner.Dispose();
        _linkService.Dispose();
        _machineChannel.Dispose();
        Host.Dispose();
        try
        {
            Directory.Delete(_directory, recursive: true);
        }
        catch (IOException)
        {
            // A file the runner still writes; the temp folder is cleaned later.
        }
    }
}
