using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Logging.Abstractions;
using ModelContextProtocol;
using Moq;
using Pleiades.Playground.Timeseries.Api.Endpoints;
using Pleiades.Playground.Timeseries.Api.McpTools;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Test.UnitTests;

/// <summary>
/// <c>timeseries_topics_query</c> enforces the same limits as <c>GET /topics</c>.
/// </summary>
/// <remarks>
/// Until now the tool took <c>timeout ?? 30s</c> with no upper bound and no range check, so an agent
/// could hold a database query open for as long as it asked and query a reversed range - both of which
/// REST refuses with 400. The refusals are <see cref="McpException"/>s, because only those reach the
/// client with their message; any other exception arrives as a generic tool error.
/// </remarks>
[TestClass]
public sealed class TopicsToolsTests
{
    private static readonly DateTime Start = new(2024, 12, 12, 8, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Stop = Start.AddHours(1);

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task AStopBeforeTheStart_IsRefused_AndTheDatabaseIsNotQueried()
    {
        var db = new Mock<ITimeseriesDbService>(MockBehavior.Strict);
        var tools = new TopicsTools(db.Object);

        var error = await Assert.ThrowsExactlyAsync<McpException>(
            () => tools.QueryTopics(Stop, Start, cancellationToken: TestContext.CancellationToken));

        Assert.Contains("stopTime", error.Message, StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task ATimeoutAbove300Seconds_IsRefused_AndTheDatabaseIsNotQueried()
    {
        var db = new Mock<ITimeseriesDbService>(MockBehavior.Strict);
        var tools = new TopicsTools(db.Object);

        var error = await Assert.ThrowsExactlyAsync<McpException>(
            () => tools.QueryTopics(Start, Stop, TimeSpan.FromSeconds(301), TestContext.CancellationToken));

        Assert.Contains("300 seconds", error.Message, StringComparison.Ordinal);
    }

    [TestMethod]
    [DataRow(null, 30)]
    [DataRow(300, 300)]
    public async Task AValidRequest_ReachesTheDatabaseWithTheEffectiveTimeout(int? requestedSeconds, int expectedSeconds)
    {
        var expected = new TopicsDto();
        var db = new Mock<ITimeseriesDbService>(MockBehavior.Strict);
        db.Setup(s => s.GetTopicsByTimeRangeAsync(Start, Stop, TimeSpan.FromSeconds(expectedSeconds), It.IsAny<CancellationToken>()))
            .ReturnsAsync(expected);
        var tools = new TopicsTools(db.Object);

        var requested = requestedSeconds is { } seconds ? TimeSpan.FromSeconds(seconds) : (TimeSpan?)null;
        var result = await tools.QueryTopics(Start, Stop, requested, TestContext.CancellationToken);

        Assert.AreSame(expected, result);
        db.VerifyAll();
    }

    [TestMethod]
    public async Task AnEmptyRange_IsAccepted_LikeRest()
    {
        var db = new Mock<ITimeseriesDbService>();
        db.Setup(s => s.GetTopicsByTimeRangeAsync(Start, Start, It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TopicsDto());
        var tools = new TopicsTools(db.Object);

        await tools.QueryTopics(Start, Start, cancellationToken: TestContext.CancellationToken);

        db.VerifyAll();
    }

    [TestMethod]
    [DataRow(false, null, DisplayName = "reversed range")]
    [DataRow(true, 301, DisplayName = "timeout above 300 s")]
    public async Task RestAndMcp_RefuseWithTheSameText_FromOneCheck(bool inOrder, int? timeoutSeconds)
    {
        // The check lives once (Topics.Validate), so the next rule cannot land on one path only.
        var db = new Mock<ITimeseriesDbService>(MockBehavior.Strict);
        var (start, stop) = inOrder ? (Start, Stop) : (Stop, Start);
        var timeout = timeoutSeconds is { } seconds ? TimeSpan.FromSeconds(seconds) : (TimeSpan?)null;

        var rest = await Topics.GetTopicsByTimeRange(start, stop, timeout, db.Object, NullLoggerFactory.Instance, TestContext.CancellationToken);
        var mcp = await Assert.ThrowsExactlyAsync<McpException>(
            () => new TopicsTools(db.Object).QueryTopics(start, stop, timeout, TestContext.CancellationToken));

        var badRequest = rest.Result as BadRequest<string>;
        Assert.IsNotNull(badRequest, "REST must answer 400.");
        Assert.AreEqual(badRequest.Value, mcp.Message);
    }

    [TestMethod]
    public async Task ADatabaseTimeout_IsAToolErrorWithItsMessage_LikeRestsBadRequest()
    {
        // Before: the TimeoutException escaped and the SDK replaced its message with a generic one, so the agent
        // could not tell a timeout from a bug. REST answers 400 with the message.
        var db = new Mock<ITimeseriesDbService>(MockBehavior.Strict);
        db.Setup(s => s.GetTopicsByTimeRangeAsync(Start, Stop, It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException("The topics query timed out after 00:00:30."));

        var error = await Assert.ThrowsExactlyAsync<McpException>(
            () => new TopicsTools(db.Object).QueryTopics(Start, Stop, cancellationToken: TestContext.CancellationToken));

        Assert.AreEqual("The topics query timed out after 00:00:30.", error.Message);
        Assert.IsInstanceOfType<TimeoutException>(error.InnerException);
    }
}
