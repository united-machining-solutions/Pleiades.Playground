using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Serialization;
using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Protocol.Transport;

namespace Pleiades.Playground.Bend.Protocol.Telegrams;

/// <summary>
/// The machine side: writes each message as a file <c>{MachineFilePrefix}{n}.xml</c> into the exchange folder.
/// The running number goes on after the highest one in the folder, so a restart overwrites nothing. A file is
/// written under another name first and then renamed, so the host never reads half a file.
/// </summary>
public sealed class RciTelegramWriter
{
    private static readonly XmlSerializer Serializer = new(typeof(RciTelegram));

    private readonly RciChannelOptions _options;
    private readonly TimeProvider _time;
    private int _counter = -1;

    /// <param name="options">Folder and file name.</param>
    /// <param name="time">The clock; telegrams carry its local time.</param>
    public RciTelegramWriter(RciChannelOptions options, TimeProvider time)
    {
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _time = time ?? throw new ArgumentNullException(nameof(time));
    }

    /// <summary>Raised after a file is written, with the action and the name of the file.</summary>
    public event EventHandler<RciTelegramWrittenEventArgs>? Written;

    /// <summary>The folder and file name of the messages.</summary>
    public RciChannelOptions Options => _options;

    /// <summary><c>OperatingStateFeedback</c>, without error.</summary>
    public void SendOperatingState(RciOperatingState state)
    {
        SendOperatingState(state, string.Empty, string.Empty);
    }

    /// <summary><c>OperatingStateFeedback</c> with error number and text, for a fault.</summary>
    public void SendOperatingState(RciOperatingState state, string? errorNo, string? errorText)
    {
        Write("OperatingStateFeedback", new RciTelegram
        {
            OperatingStateFeedbacks =
            [
                new RciOperatingStateMessage
                {
                    Timestamp = Timestamp(),
                    OperatingState = ((int)state).ToString(CultureInfo.InvariantCulture),
                    ErrorNo = errorNo ?? string.Empty,
                    ErrorText = errorText ?? string.Empty,
                },
            ],
        });
    }

    /// <summary><c>ManufacturingOrderFeedback</c>: the processed parts of one order so far.</summary>
    public void SendManufacturingOrderFeedback(ProductionPackage package, ManufacturingOrder order)
    {
        ArgumentNullException.ThrowIfNull(package);
        ArgumentNullException.ThrowIfNull(order);
        Write("ManufacturingOrderFeedback", new RciTelegram
        {
            ManufacturingOrderFeedbacks =
            [
                new RciOrderMessage
                {
                    Timestamp = Timestamp(),
                    ReportedBy = package.ReportedBy,
                    ManufacturingOrders = [new RciOrderInPackage(order, package.ProductionPackageName)],
                },
            ],
        });
    }

    /// <summary>
    /// <c>ProcessingStarted</c> (interface description 4.2.1): the machine started the processing of one order, status
    /// 7 active, reported by the operator of the package.
    /// </summary>
    public void SendProcessingStarted(ProductionPackage package, ManufacturingOrder order, RciProcessingTimeType timeType)
    {
        Write("ProcessingStarted", new RciTelegram { ProcessingsStarted = [ProcessingMessage(package, order, timeType)] });
    }

    /// <summary>
    /// <c>ProcessingStopped</c> (interface description 4.2.3): the machine ended the processing of one order. Its status
    /// says how, 14 finished or 12 paused; the machine then runs no program of it.
    /// </summary>
    public void SendProcessingStopped(ProductionPackage package, ManufacturingOrder order, RciProcessingTimeType timeType)
    {
        Write("ProcessingStopped", new RciTelegram { ProcessingsStopped = [ProcessingMessage(package, order, timeType)] });
    }

    private RciProcessingMessage ProcessingMessage(ProductionPackage package, ManufacturingOrder order, RciProcessingTimeType timeType)
    {
        ArgumentNullException.ThrowIfNull(package);
        ArgumentNullException.ThrowIfNull(order);
        return new RciProcessingMessage
        {
            Timestamp = Timestamp(),
            ReportedBy = package.ReportedBy,
            ManufacturingOrders = [new RciOrderInPackage(order, package.ProductionPackageName)],
            Type = ((int)timeType).ToString(CultureInfo.InvariantCulture),
        };
    }

    /// <summary><c>ProductionPackageFeedback</c>: how often the package is made so far, status active.</summary>
    public void SendProductionPackageFeedback(ProductionPackage package, string? reportedBy)
    {
        ArgumentNullException.ThrowIfNull(package);
        Write("ProductionPackageFeedback", new RciTelegram
        {
            ProductionPackageFeedbacks =
            [
                new RciPackageMessage
                {
                    Timestamp = Timestamp(),
                    ReportedBy = reportedBy ?? string.Empty,
                    ProductionPackages =
                    [
                        new RciPackageState
                        {
                            ProductionPackageName = package.ProductionPackageName,
                            DesiredQuantity = package.DesiredQuantity,
                            ProcessedQuantity = package.ProcessedQuantity,
                            StatusText = ((int)RciPackageStatus.AKTIV).ToString(CultureInfo.InvariantCulture),
                        },
                    ],
                },
            ],
        });
    }

    private string Timestamp() => _time.GetLocalNow().ToString(RciChannelOptions.TimestampFormat, CultureInfo.InvariantCulture);

    private void Write(string action, RciTelegram telegram)
    {
        Directory.CreateDirectory(_options.Directory);
        var number = NextNumber();
        var fileName = string.Concat(_options.MachineFilePrefix, number.ToString(CultureInfo.InvariantCulture), ".xml");
        var path = Path.Combine(_options.Directory, fileName);
        var partial = Path.Combine(_options.Directory, $".{fileName}.partial");

        using (var writer = new StreamWriter(partial))
        {
            // CRLF, so the files are byte for byte those of the machine on Windows, also from a Linux container.
            using var xmlWriter = XmlWriter.Create(writer, new XmlWriterSettings { Indent = true, NewLineChars = "\r\n" });
            Serializer.Serialize(xmlWriter, telegram);
        }

        File.Move(partial, path, overwrite: true);
        Written?.Invoke(this, new RciTelegramWrittenEventArgs(action, fileName));
    }

    private int NextNumber()
    {
        if (Volatile.Read(ref _counter) < 0)
        {
            Interlocked.CompareExchange(ref _counter, HighestNumberInFolder(), -1);
        }

        return Interlocked.Increment(ref _counter);
    }

    private int HighestNumberInFolder()
    {
        var pattern = new Regex($"^{Regex.Escape(_options.MachineFilePrefix)}(\\d+)\\.xml$", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
        return Directory.EnumerateFiles(_options.Directory, $"{_options.MachineFilePrefix}*.xml")
            .Select(path => pattern.Match(Path.GetFileName(path)))
            .Where(match => match.Success)
            .Select(match => int.TryParse(match.Groups[1].Value, NumberStyles.None, CultureInfo.InvariantCulture, out var n) ? n : 0)
            .DefaultIfEmpty(0)
            .Max();
    }
}

/// <summary>A message file that was written.</summary>
/// <param name="action">The message, for example <c>ManufacturingOrderFeedback</c>.</param>
/// <param name="fileName">The name of the file.</param>
public sealed class RciTelegramWrittenEventArgs(string action, string fileName) : EventArgs
{
    /// <summary>The message, for example <c>ManufacturingOrderFeedback</c>.</summary>
    public string Action { get; } = action;

    /// <summary>The name of the file.</summary>
    public string FileName { get; } = fileName;
}
