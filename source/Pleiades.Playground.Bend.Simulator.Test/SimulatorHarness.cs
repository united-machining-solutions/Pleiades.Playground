using System.Globalization;
using System.Xml.Serialization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Bend.Protocol.Transport;
using Pleiades.Playground.Bend.Simulator.Machine;
using Pleiades.Playground.Bend.Simulator.Processing;
using Pleiades.Playground.Bend.Simulator.ProductionPlan;

namespace Pleiades.Playground.Bend.Simulator.Test;

/// <summary>
/// One simulator on a temporary exchange folder and state file, wired like in Program.cs, with helpers to read the
/// telegrams it wrote in the order it wrote them.
/// </summary>
internal sealed class SimulatorHarness : IDisposable
{
    private const string Prefix = RciChannelOptions.DefaultMachineFilePrefix;

    public SimulatorHarness(string serialNumber = "A123", string manufacturer = "Manufacturer_A", string model = "")
    {
        Root = Directory.CreateTempSubdirectory("bend-simulator-").FullName;
        Config = NewConfig(serialNumber, manufacturer, model);
        Runtime = CreateRuntime(Config);
        ProductionPlan = new ProductionPlanService(Runtime, BusyState, new DummyProductionDataFactory(new Random(4711), TimeProvider.System));
        Processing = new AutomaticProcessingService(
            Runtime, BusyState, TimeProvider.System, NullLogger<AutomaticProcessingService>.Instance);
    }

    public string Root { get; }

    public string ExchangeDirectory => Path.Combine(Root, "exchange");

    public Config Config { get; }

    public MachineBusyState BusyState { get; } = new();

    public SimulatorRuntime Runtime { get; }

    public ProductionPlanService ProductionPlan { get; }

    public AutomaticProcessingService Processing { get; }

    /// <summary>The persistence of <see cref="Runtime"/>, not started: tests call Load and SaveAsync.</summary>
    public StatePersistence Persistence => PersistenceFor(Runtime, Config);

    public static StatePersistence PersistenceFor(SimulatorRuntime runtime, Config config) => new(
        runtime,
        new DummyProductionDataFactory(new Random(4711), TimeProvider.System),
        Options.Create(config),
        NullLogger<StatePersistence>.Instance);

    public Config NewConfig(string serialNumber, string manufacturer = "Manufacturer_A", string model = "") => new()
    {
        SerialNumber = serialNumber,
        Manufacturer = manufacturer,
        Model = model,
        ExchangeDirectory = ExchangeDirectory,
        StatePath = Path.Combine(Root, "state.json"),
        PartFeedbackInterval = TimeSpan.Zero,
        PositionChangeInterval = TimeSpan.Zero,
    };

    /// <summary>A second simulator on the same folders: a restart of the container.</summary>
    public SimulatorRuntime CreateRuntime(Config config)
    {
        var writer = new RciTelegramWriter(
            new RciChannelOptions { Directory = config.ExchangeDirectory, MachineFilePrefix = config.MachineFilePrefix },
            TimeProvider.System);
        return new SimulatorRuntime(Options.Create(config), writer, NullLogger<SimulatorRuntime>.Instance);
    }

    public IReadOnlyList<string> TelegramFilesInOrder()
    {
        return Directory.GetFiles(ExchangeDirectory, $"{Prefix}*.xml")
            .OrderBy(file => int.Parse(Path.GetFileNameWithoutExtension(file)[Prefix.Length..], CultureInfo.InvariantCulture))
            .ToArray();
    }

    public IReadOnlyList<RciTelegram> TelegramsInOrder()
    {
        var serializer = new XmlSerializer(typeof(RciTelegram));
        return TelegramFilesInOrder()
            .Select(file =>
            {
                using var reader = System.Xml.XmlReader.Create(file, new System.Xml.XmlReaderSettings { DtdProcessing = System.Xml.DtdProcessing.Prohibit, XmlResolver = null });
                return (RciTelegram)serializer.Deserialize(reader)!;
            })
            .ToArray();
    }

    public async Task<AutomaticProcessingStatusDto> WaitForProcessingEndAsync()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        while (BusyState.IsBusy)
        {
            await Task.Delay(20, timeout.Token);
        }

        return Processing.GetStatus();
    }

    public void Dispose()
    {
        try
        {
            Directory.Delete(Root, recursive: true);
        }
        catch (IOException)
        {
            // A file still open on a slow machine; the temp folder is cleaned up later.
        }
    }
}
