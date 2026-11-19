using System.Xml.Serialization;
using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Bend.Protocol.Transport;

namespace Pleiades.Playground.Bend.Protocol.Test;

[TestClass]
public sealed class RciTelegramWriterTest
{
    private sealed class FixedTime(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now.ToUniversalTime();

        public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");
    }

    // 10:15:30 in Berlin, CET.
    private static readonly FixedTime Clock = new(new DateTimeOffset(2026, 11, 17, 10, 15, 30, TimeSpan.FromHours(1)));

    private static (RciTelegramWriter Writer, string Directory) NewWriter()
    {
        var directory = System.IO.Directory.CreateTempSubdirectory("rci-writer-").FullName;
        return (new RciTelegramWriter(new RciChannelOptions { Directory = directory }, Clock), directory);
    }

    private static ProductionPackage Package(out ManufacturingOrder order)
    {
        order = new ManufacturingOrder { OrderNo = "FA-1", PartNo = "Winkel-1", ProgramName = "WINKEL_1.bend", DesiredNumberOfParts = 3 };
        return new ProductionPackage { ProductionPackageName = "PP-1", DesiredQuantity = 2, ReportedBy = "Operator", ManufacturingOrders = [order] };
    }

    [TestMethod]
    public void Written_telegrams_are_read_back_by_the_parser_of_the_host()
    {
        var (writer, directory) = NewWriter();
        try
        {
            var package = Package(out var order);
            order.Status = RciOrderStatus.AKTIV;
            order.ProcessedParts = 2;

            writer.SendOperatingState(RciOperatingState.Fault, "4711", "Light curtain");
            writer.SendManufacturingOrderFeedback(package, order);
            writer.SendProductionPackageFeedback(package, string.Empty);

            var parser = new RciTelegramParser(Clock.LocalTimeZone);
            var files = new RciExchangeDirectory(directory, RciChannelOptions.DefaultMachineFilePrefix).FindNew(DateTime.UtcNow.AddMinutes(1));
            var observations = files.SelectMany(file => parser.Parse(File.ReadAllText(file.Path), file.WrittenAtUtc)).ToList();

            Assert.AreEqual(3, files.Count);
            var state = (OperatingStateObserved)observations[0];
            Assert.AreEqual(-1, state.OperatingState);
            Assert.AreEqual("4711", state.ErrorNo);
            Assert.AreEqual(new DateTime(2026, 11, 17, 9, 15, 30, DateTimeKind.Utc), state.Timestamp);
            var feedback = (OrderObserved)observations[1];
            Assert.AreEqual("PP-1", feedback.ProductionPackage);
            Assert.AreEqual("FA-1", feedback.OrderNo);
            Assert.AreEqual("WINKEL_1.bend", feedback.ProgramName);
            Assert.AreEqual(2, feedback.ProcessedParts);
            Assert.AreEqual(3, feedback.DesiredParts);
            var packageFeedback = (PackageObserved)observations[2];
            Assert.AreEqual(2, packageFeedback.DesiredQuantity);
        }
        finally
        {
            System.IO.Directory.Delete(directory, recursive: true);
        }
    }

    [TestMethod]
    public void A_telegram_keeps_the_shape_of_the_machine()
    {
        var (writer, directory) = NewWriter();
        try
        {
            var package = Package(out var order);
            order.Status = RciOrderStatus.AKTIV;
            order.ProcessedParts = 1;

            writer.SendManufacturingOrderFeedback(package, order);

            var content = File.ReadAllText(Path.Combine(directory, "RCIMaschToServ1.xml"));
            StringAssert.Contains(content, "<RCIInterface ", StringComparison.Ordinal);
            StringAssert.Contains(content, "Version=\"3.2\"", StringComparison.Ordinal);
            StringAssert.Contains(content, "<ManufacturingOrder OrderNo=\"FA-1\" Name=\"PP-1\">", StringComparison.Ordinal);
            StringAssert.Contains(content, "<Timestamp>2026.11.17 10:15:30</Timestamp>", StringComparison.Ordinal);
            StringAssert.Contains(content, "<ProcessedParts>1</ProcessedParts>", StringComparison.Ordinal);
            StringAssert.Contains(content, "<Status>7</Status>", StringComparison.Ordinal);
            Assert.IsFalse(content.Replace("\r\n", string.Empty, StringComparison.Ordinal).Contains('\n', StringComparison.Ordinal),
                "every line break is CRLF, as on Windows");
            using var reader = System.Xml.XmlReader.Create(new StringReader(content), new System.Xml.XmlReaderSettings { DtdProcessing = System.Xml.DtdProcessing.Prohibit, XmlResolver = null });
            var telegram = (RciTelegram)new XmlSerializer(typeof(RciTelegram)).Deserialize(reader)!;
            Assert.AreEqual("Operator", telegram.ManufacturingOrderFeedbacks![0].ReportedBy);
        }
        finally
        {
            System.IO.Directory.Delete(directory, recursive: true);
        }
    }

    [TestMethod]
    public void The_running_number_goes_on_after_the_files_in_the_folder_and_leaves_no_partial_file()
    {
        var (writer, directory) = NewWriter();
        try
        {
            File.WriteAllText(Path.Combine(directory, "RCIMaschToServ7.xml"), "<RCIInterface />");

            writer.SendOperatingState(RciOperatingState.Running);

            Assert.IsTrue(File.Exists(Path.Combine(directory, "RCIMaschToServ8.xml")));
            Assert.AreEqual(2, System.IO.Directory.GetFiles(directory).Length);
        }
        finally
        {
            System.IO.Directory.Delete(directory, recursive: true);
        }
    }
}
