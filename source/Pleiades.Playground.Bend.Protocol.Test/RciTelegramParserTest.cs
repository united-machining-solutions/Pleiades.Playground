using Pleiades.Playground.Bend.Protocol.Telegrams;
using Pleiades.Playground.Bend.Protocol.Transport;

namespace Pleiades.Playground.Bend.Protocol.Test;

[TestClass]
public sealed class RciTelegramParserTest
{
    private static readonly DateTime Fallback = new(2026, 11, 17, 12, 0, 0, DateTimeKind.Utc);

    // As the Bend RCI simulator writes them (TcBendRciSender), with CRLF and an XML declaration.
    private const string OPERATING_STATE_RUNNING = """
        <?xml version="1.0" encoding="utf-8"?>
        <RCIInterface xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" Version="3.1">
          <OperatingStateFeedback>
            <Timestamp>2026.11.17 10:15:30</Timestamp>
            <ReportedBy />
            <OperatingState>1</OperatingState>
            <ErrorNo />
            <ErrorText />
          </OperatingStateFeedback>
        </RCIInterface>
        """;

    private const string OPERATING_STATE_FAULT = """
        <?xml version="1.0" encoding="utf-8"?>
        <RCIInterface Version="3.1">
          <OperatingStateFeedback>
            <Timestamp>2026.11.17 10:16:00</Timestamp>
            <OperatingState>-1</OperatingState>
            <ErrorNo>4711</ErrorNo>
            <ErrorText>Light curtain interrupted</ErrorText>
          </OperatingStateFeedback>
        </RCIInterface>
        """;

    private const string PART_FEEDBACK = """
        <?xml version="1.0" encoding="utf-8"?>
        <RCIInterface Version="3.1">
          <ManufacturingOrderFeedback>
            <Timestamp>2026.11.17 10:17:00</Timestamp>
            <ReportedBy>Operator</ReportedBy>
            <ManufacturingOrder OrderNo="FA-100" Name="PP-1">
              <PositionNo>1</PositionNo>
              <PartNo>BRACKET-12</PartNo>
              <ProgramName>BRACKET_12.bend</ProgramName>
              <DesiredNumberOfParts>3</DesiredNumberOfParts>
              <ProcessedParts>3</ProcessedParts>
              <Status>7</Status>
              <ScrapParts>0</ScrapParts>
            </ManufacturingOrder>
          </ManufacturingOrderFeedback>
        </RCIInterface>
        """;

    private const string PACKAGE_STOPPED_WITHOUT_TIMESTAMP = """
        <?xml version="1.0" encoding="utf-8"?>
        <RCIInterface Version="3.1">
          <ProductionPackageStopped>
            <ReportedBy />
            <ProductionPackage Name="PP-1">
              <DesiredQuantity>2</DesiredQuantity>
              <ProcessedQuantity>1</ProcessedQuantity>
              <Status>7</Status>
            </ProductionPackage>
          </ProductionPackageStopped>
        </RCIInterface>
        """;

    private static RciTelegramParser Parser() => new(TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin"));


    [TestMethod]
    public void Parse_converts_the_local_rci_timestamp_to_utc()
    {
        var observation = (OperatingStateObserved)Parser().Parse(OPERATING_STATE_RUNNING, Fallback).Single();

        Assert.AreEqual(1, observation.OperatingState);
        // November: Central European Time, UTC+1.
        Assert.AreEqual(new DateTime(2026, 11, 17, 9, 15, 30, DateTimeKind.Utc), observation.Timestamp);
        Assert.AreEqual(DateTimeKind.Utc, observation.Timestamp.Kind);
    }

    [TestMethod]
    public void Parse_takes_the_time_of_the_file_when_the_message_has_none()
    {
        var observation = (PackageObserved)Parser().Parse(PACKAGE_STOPPED_WITHOUT_TIMESTAMP, Fallback).Single();

        Assert.AreEqual(Fallback, observation.Timestamp);
        Assert.AreEqual("PP-1", observation.Name);
        Assert.AreEqual(1, observation.ProcessedQuantity);
        Assert.AreEqual(2, observation.DesiredQuantity);
    }

    [TestMethod]
    public void Parse_reads_the_order_of_a_part_feedback()
    {
        var order = (OrderObserved)Parser().Parse(PART_FEEDBACK, Fallback).Single();

        Assert.AreEqual(OrderEvent.Feedback, order.Event);
        Assert.AreEqual("FA-100", order.OrderNo);
        Assert.AreEqual("PP-1", order.ProductionPackage);
        Assert.AreEqual("BRACKET_12.bend", order.ProgramName);
        Assert.AreEqual(3, order.ProcessedParts);
        Assert.AreEqual(3, order.DesiredParts);
    }

    [TestMethod]
    public void Parse_skips_responses_to_commands()
    {
        const string response = """<RCIInterface Version="3.1"><StartProductionPlanResponse><ReturnCode>0</ReturnCode></StartProductionPlanResponse></RCIInterface>""";

        Assert.AreEqual(0, Parser().Parse(response, Fallback).Count);
    }

    [TestMethod]
    public void Parse_throws_on_a_file_that_is_not_complete()
    {
        Assert.ThrowsExactly<System.Xml.XmlException>(() => Parser().Parse("<RCIInterface Version=\"3.1\"><Operat", Fallback));
    }

    [TestMethod]
    public void ExchangeDirectory_finds_a_file_once_and_again_when_it_is_written_again()
    {
        var directory = Directory.CreateTempSubdirectory("rci-test-").FullName;
        try
        {
            var path = Path.Combine(directory, "RCIMaschToServ1.xml");
            File.WriteAllText(path, OPERATING_STATE_RUNNING);
            File.SetLastWriteTimeUtc(path, Fallback);
            File.WriteAllText(Path.Combine(directory, "other.xml"), "<x/>");
            var transfer = new RciExchangeDirectory(directory, "RCIMaschToServ");

            var first = transfer.FindNew(DateTime.UtcNow).Single();
            transfer.MarkRead(first);
            var unchanged = transfer.FindNew(DateTime.UtcNow);
            File.WriteAllText(path, OPERATING_STATE_FAULT);
            File.SetLastWriteTimeUtc(path, Fallback.AddMinutes(1));
            var rewritten = transfer.FindNew(DateTime.UtcNow);

            Assert.AreEqual(1, first.Number);
            Assert.AreEqual(0, unchanged.Count);
            Assert.AreEqual(1, rewritten.Count);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [TestMethod]
    public void ExchangeDirectory_waits_for_a_file_that_is_still_being_written()
    {
        var directory = Directory.CreateTempSubdirectory("rci-test-").FullName;
        try
        {
            File.WriteAllText(Path.Combine(directory, "RCIMaschToServ7.xml"), OPERATING_STATE_RUNNING);
            var transfer = new RciExchangeDirectory(directory, "RCIMaschToServ");

            Assert.AreEqual(0, transfer.FindNew(DateTime.UtcNow.AddMinutes(-1)).Count);
            Assert.AreEqual(1, transfer.FindNew(DateTime.UtcNow.AddMinutes(1)).Count);
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
