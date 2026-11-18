using System.Globalization;
using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;

namespace Pleiades.Playground.Cutting.Protocol.Test;

[TestClass]
public sealed class CuttingReplyBuilderTest
{
    private static readonly CuttingTelegram Request = CuttingTelegram.Request(CuttingCommands.ShowPlan, 5, "1");

    [TestMethod]
    public void Table_NoRows_GivesOneReplyOfThirtyCharacters()
    {
        var replies = CuttingReplyBuilder.Table(Request, []);

        Assert.HasCount(1, replies);
        Assert.AreEqual(CuttingTelegramKind.Last, replies[0].Kind);
        Assert.AreEqual(30, replies[0].Format().Length);
    }

    [TestMethod]
    public void Table_FewRows_GivesOneLastReply()
    {
        var replies = CuttingReplyBuilder.Table(Request, [Row(1), Row(2)]);

        Assert.HasCount(1, replies);
        Assert.AreEqual(CuttingTelegramKind.Last, replies[0].Kind);
        Assert.AreEqual(2, replies[0].Rows);
        Assert.AreEqual(15, replies[0].Columns);
    }

    [TestMethod]
    public void Table_MoreRowsThanFitInOneTelegram_AppendsAndEndsWithLast()
    {
        var rows = Enumerable.Range(1, 60).Select(Row).ToList();

        var replies = CuttingReplyBuilder.Table(Request, rows);

        Assert.IsGreaterThan(1, replies.Count);
        Assert.IsTrue(replies.Take(replies.Count - 1).All(r => r.Kind == CuttingTelegramKind.Append));
        Assert.AreEqual(CuttingTelegramKind.Last, replies[^1].Kind);
        Assert.IsTrue(replies.All(r => r.Format().Length <= CuttingFormat.MaxTelegramLength));
        Assert.AreEqual(60, replies.Sum(r => r.Rows), "No row is lost.");
        Assert.IsTrue(replies.All(r => r.TransactionNumber == Request.TransactionNumber));
    }

    private static IReadOnlyList<string> Row(int number)
    {
        var n = number.ToString(CultureInfo.InvariantCulture);
        return ["1", n, $"ORDER-{n}", $"PROGRAM_WITH_A_LONG_NAME_{n}", "10", "0", "0", "", "", "", "", "", "1.0038-3.0", "", "45"];
    }
}
