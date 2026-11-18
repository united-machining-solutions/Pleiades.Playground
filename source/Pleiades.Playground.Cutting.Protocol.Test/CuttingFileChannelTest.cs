using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Protocol.Telegrams;
using Pleiades.Playground.Cutting.Protocol.Transport;

namespace Pleiades.Playground.Cutting.Protocol.Test;

[TestClass]
public sealed class CuttingFileChannelTest
{
    private string _directory = string.Empty;

    public TestContext TestContext { get; set; } = default!;

    [TestInitialize]
    public void CreateDirectory()
    {
        _directory = Path.Combine(Path.GetTempPath(), "cutting-channel-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_directory);
    }

    [TestCleanup]
    public void DeleteDirectory()
    {
        Directory.Delete(_directory, recursive: true);
    }

    [TestMethod]
    public async Task SendAndReceive_HostToMachine_DeliversEveryLineOnceAndLeavesNoFileBehind()
    {
        using var host = Channel(CuttingRole.Host);
        using var machine = Channel(CuttingRole.Machine);
        var token = TestContext.CancellationToken;

        Assert.IsTrue(await host.SendAsync([CuttingTelegram.Request(CuttingCommands.Connect, 1, "2.1.0")], token));
        Assert.IsTrue(await host.SendAsync([CuttingTelegram.Request(CuttingCommands.ShowPlan, 2, "1")], token));
        var received = await machine.ReceiveAsync(token);
        var again = await machine.ReceiveAsync(token);

        Assert.HasCount(2, received);
        StringAssert.StartsWith(received[0], "SRC9CONNR", StringComparison.Ordinal);
        StringAssert.StartsWith(received[1], "PRD_SHOWR", StringComparison.Ordinal);
        Assert.IsEmpty(again);
        Assert.IsEmpty(Directory.GetFiles(_directory), "At rest there is no telegram and no semaphore file.");
    }

    [TestMethod]
    public async Task Receive_ANotification_KeepsItsLeadingSpaces()
    {
        using var host = Channel(CuttingRole.Host);
        using var machine = Channel(CuttingRole.Machine);
        var token = TestContext.CancellationToken;

        await machine.SendAsync([CuttingNotification.Create(CuttingNotifications.ServerConnect)], token);
        var received = await host.ReceiveAsync(token);

        Assert.HasCount(1, received);
        Assert.IsInstanceOfType<CuttingNotification>(CuttingTelegramParser.Parse(received[0]));
    }

    [TestMethod]
    public async Task Receive_WhileTheOtherSideWrites_WaitsAndTakesNothing()
    {
        using var host = Channel(CuttingRole.Host);
        using var machine = Channel(CuttingRole.Machine, TimeSpan.FromMilliseconds(200));
        var token = TestContext.CancellationToken;
        await host.SendAsync([CuttingTelegram.Request(CuttingCommands.SystemTime, 1, "1")], token);
        await File.WriteAllBytesAsync(Path.Combine(_directory, "s1_to_m1.wr"), [], token);

        var received = await machine.ReceiveAsync(token);

        Assert.IsEmpty(received);
        Assert.IsTrue(File.Exists(Path.Combine(_directory, "s1_to_m1.dat")), "The telegram stays for the next look.");
        Assert.IsFalse(File.Exists(Path.Combine(_directory, "s1_to_m1.rd")));
    }

    [TestMethod]
    public async Task Send_WhileTheOtherSideReads_GivesUpAfterTheTimeout()
    {
        using var machine = Channel(CuttingRole.Machine, TimeSpan.FromMilliseconds(200));
        var token = TestContext.CancellationToken;
        await File.WriteAllBytesAsync(Path.Combine(_directory, "m1_to_s1.rd"), [], token);

        var sent = await machine.SendAsync([CuttingNotification.Create(CuttingNotifications.PlanChanged, "1")], token);

        Assert.IsFalse(sent);
        Assert.IsFalse(File.Exists(Path.Combine(_directory, "m1_to_s1.dat")));
        Assert.IsFalse(File.Exists(Path.Combine(_directory, "m1_to_s1.wr")));
    }

    [TestMethod]
    public void Prepare_LeftoverSemaphoresOfThisSide_AreDeleted_ThoseOfTheOtherSideStay()
    {
        File.WriteAllBytes(Path.Combine(_directory, "m1_to_s1.wr"), []);
        File.WriteAllBytes(Path.Combine(_directory, "s1_to_m1.rd"), []);
        File.WriteAllBytes(Path.Combine(_directory, "s1_to_m1.wr"), []);
        using var machine = Channel(CuttingRole.Machine);

        machine.Prepare();

        CollectionAssert.AreEquivalent(new[] { "s1_to_m1.wr" }, Directory.GetFiles(_directory).Select(Path.GetFileName).ToArray());
    }

    private CuttingFileChannel Channel(CuttingRole role, TimeSpan? lockTimeout = null)
    {
        return new CuttingFileChannel(new CuttingChannelOptions
        {
            Directory = _directory,
            Role = role,
            RetryInterval = TimeSpan.FromMilliseconds(10),
            LockTimeout = lockTimeout ?? TimeSpan.FromSeconds(5),
        });
    }
}
