using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Protocol.Test;

[TestClass]
public sealed class CuttingTelegramTest
{
    [TestMethod]
    public void Format_Request_PutsTheFieldsAtTheOffsetsOfTheSpecification()
    {
        var line = CuttingTelegram.Request(CuttingCommands.SplitProgram, 1, "234", @"h:\test", "pt.lst", "0").Format();

        Assert.AreEqual(@"SPLITPRGR+00000000000000000001" + @"0004|0000^234^h:\test^pt.lst^0^", line);
        Assert.AreEqual('|', line[34], "Character 35 is the bar.");
    }

    [TestMethod]
    public void Format_ReplyWithoutFields_EndsAfterTheTransactionNumber()
    {
        var request = CuttingTelegram.Request(CuttingCommands.ShowPlan, 42, "1");

        var line = CuttingTelegram.Reply(request).Format();

        Assert.AreEqual(30, line.Length);
        Assert.AreEqual("PRD_SHOWL+00000000000000000042", line);
    }

    [TestMethod]
    public void Parse_TheExampleOfTheSpecification_ReadsCommandTransactionAndFields()
    {
        // §3.1. The example has two characters more before the bar than the table says; the reader finds the bar.
        var message = CuttingTelegramParser.Parse(@"SPLITPRGR+00000000000000000000010004|0000^234^h:\test^pt.lst^0^");

        var telegram = (CuttingTelegram)message;
        Assert.AreEqual(CuttingCommands.SplitProgram, telegram.Command);
        Assert.AreEqual(CuttingTelegramKind.Request, telegram.Kind);
        Assert.AreEqual("0000000001", telegram.TransactionNumber);
        Assert.AreEqual(4, telegram.Columns);
        Assert.AreEqual(0, telegram.Rows);
        CollectionAssert.AreEqual(new[] { "234", @"h:\test", "pt.lst", "0" }, telegram.Fields.ToArray());
    }

    [TestMethod]
    public void Parse_WhatFormatWrote_GivesTheSameTelegram()
    {
        var request = CuttingTelegram.Request(CuttingCommands.ModifyState, 7, "1", "", "ORDER-1", "", "9");

        var parsed = (CuttingTelegram)CuttingTelegramParser.Parse(request.Format());

        Assert.AreEqual(request.Command, parsed.Command);
        Assert.AreEqual(request.TransactionNumber, parsed.TransactionNumber);
        CollectionAssert.AreEqual(request.Fields.ToArray(), parsed.Fields.ToArray(), "Empty fields keep their place.");
    }

    [TestMethod]
    public void Parse_ATableReply_SplitsTheFieldsIntoRows()
    {
        var parsed = (CuttingTelegram)CuttingTelegramParser.Parse("PALSSHOWL+000000000000000000040005|0002^1^1^BT^*^11^1^9^NCP^P1^3^");

        var rows = parsed.RowsOfFields();

        Assert.HasCount(2, rows);
        CollectionAssert.AreEqual(new[] { "1", "9", "NCP", "P1", "3" }, rows[1].ToArray());
    }

    [TestMethod]
    public void Parse_FieldsBeyondTheKnownOnesAndNoClosingSeparator_AreKept()
    {
        var parsed = CuttingTelegramParser.Parse("MACHINFOL+000000000000000000020003|0001^1^0^0^extra^last");

        CollectionAssert.AreEqual(new[] { "1", "0", "0", "extra", "last" }, parsed.Fields.ToArray());
        Assert.AreEqual("extra", parsed.Field(4));
        Assert.AreEqual(string.Empty, parsed.Field(9), "A field beyond the end is empty.");
    }

    [TestMethod]
    public void Format_Notification_HasTheHeaderOfTheSpecification()
    {
        var line = CuttingNotification.Create(CuttingNotifications.MachineRunning, "1", "PROG", "17.11.2026-08:15:00").Format();

        Assert.AreEqual("        N+0000000000          $$MaschineLaeuft$$1^PROG^17.11.2026-08:15:00^", line);
        Assert.AreEqual("$$", line.Substring(30, 2), "The name starts at character 31.");
    }

    [TestMethod]
    public void Parse_NotificationAsTheSpecificationPrintsIt_ReadsTheName()
    {
        // §2.5 prints twenty spaces after the error code.
        var parsed = (CuttingNotification)CuttingTelegramParser.Parse("        N+0000000000                    $$src9_server_connect$$");

        Assert.AreEqual(CuttingNotifications.ServerConnect, parsed.Name);
        Assert.IsEmpty(parsed.Fields);
    }

    [TestMethod]
    public void Format_AFieldWithASeparatorOrLineBreak_CannotBreakTheTelegram()
    {
        var line = CuttingNotification.Create(CuttingNotifications.NcUserMessage, "1", "a^b\r\nc").Format();

        var parsed = CuttingTelegramParser.Parse(line);

        CollectionAssert.AreEqual(new[] { "1", "a b  c" }, parsed.Fields.ToArray());
    }

    [TestMethod]
    [DataRow("")]
    [DataRow("SHORT")]
    [DataRow("PRD_SHOWX+0000000000000000000100")]
    [DataRow("        N+0000000000          no name")]
    public void TryParse_NotATelegram_SaysWhy(string line)
    {
        Assert.IsFalse(CuttingTelegramParser.TryParse(line, out _, out var error));
        Assert.IsFalse(string.IsNullOrEmpty(error));
    }

    [TestMethod]
    public void Timestamp_HasTheFormatOfTheSpecification()
    {
        var text = CuttingFormat.Timestamp(new DateTime(2026, 11, 7, 9, 5, 3, DateTimeKind.Local));

        Assert.AreEqual("07.11.2026-09:05:03", text);
        Assert.IsTrue(CuttingFormat.TryParseTimestamp(text, out var parsed));
        Assert.AreEqual(3, parsed.Second);
    }
}
