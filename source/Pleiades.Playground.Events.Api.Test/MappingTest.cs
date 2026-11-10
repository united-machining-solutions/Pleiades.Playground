using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Mapping;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

[TestClass]
public sealed class MappingTest
{
    [TestMethod]
    public void Map_NotificationEventDaoToDto_CopiesAllFields()
    {
        var source = new NotificationEventDao
        {
            Timestamp = DateTime.UtcNow,
            Id = "id1",
            MId = "9000-0001",
            Level = EventLevel.Error,
            Action = NotificationAction.Raised,
            Title = "Machine error",
            LocalizedTitle = "Machine error (localized)",
            NotificationId = "notif-1",
            CorrelationId = "corr-1"
        };

        var actual = EventsMapper.Map(source);

        Assert.AreEqual(source.Id, actual.Id);
        Assert.AreEqual(source.MId, actual.MId);
        Assert.AreEqual(source.Level, actual.Level);
        Assert.AreEqual(source.Action, actual.Action);
        Assert.AreEqual(source.Title, actual.Title);
        Assert.AreEqual(source.LocalizedTitle, actual.LocalizedTitle);
        Assert.AreEqual(source.NotificationId, actual.NotificationId);
        Assert.AreEqual(source.CorrelationId, actual.CorrelationId);
    }

    [TestMethod]
    public void Map_PairedNotificationEventDaoToDto_CopiesAllFields()
    {
        var source = new PairedNotificationEventDao
        {
            CorrelationId = "corr-1",
            MId = "9000-0001",
            NotificationId = "notif-1",
            Level = EventLevel.Warning,
            Title = "raised",
            LocalizedTitle = "raised (localized)",
            TimestampRaised = DateTime.UtcNow,
            TimestampGone = null,
            Duration = TimeSpan.FromMinutes(5)
        };

        var actual = EventsMapper.Map(source);

        Assert.AreEqual(source.CorrelationId, actual.CorrelationId);
        Assert.AreEqual(source.MId, actual.MId);
        Assert.AreEqual(source.NotificationId, actual.NotificationId);
        Assert.AreEqual(source.Level, actual.Level);
        Assert.AreEqual(source.TimestampRaised, actual.TimestampRaised);
        Assert.AreEqual(source.TimestampGone, actual.TimestampGone);
        Assert.AreEqual(source.Duration, actual.Duration);
    }

    [TestMethod]
    public void Map_LevelDistributionDaoToDto_CopiesAllFields()
    {
        var source = new LevelDistributionDao { Level = EventLevel.Error, Count = 7 };

        var actual = EventsMapper.Map(source);

        Assert.AreEqual(source.Level, actual.Level);
        Assert.AreEqual(source.Count, actual.Count);
    }

    [TestMethod]
    public void Map_TimeBucketDaoToDto_CopiesTimestampAndDistribution()
    {
        var source = new TimeBucketDao
        {
            Timestamp = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            Distribution =
            [
                new LevelDistributionDao { Level = EventLevel.Information, Count = 1 },
                new LevelDistributionDao { Level = EventLevel.Error, Count = 2 }
            ]
        };

        var actual = EventsMapper.Map(source);

        Assert.AreEqual(source.Timestamp, actual.Timestamp);
        Assert.HasCount(2, actual.Distribution);
        Assert.AreEqual(EventLevel.Error, actual.Distribution[1].Level);
        Assert.AreEqual(2, actual.Distribution[1].Count);
    }

    [TestMethod]
    public void Map_NotificationMessageStatisticsDaoToDto_ConvertsTicksToTimeSpan()
    {
        var source = new NotificationMessageStatisticsDao
        {
            NotificationId = "notif-1",
            Title = "title",
            Level = EventLevel.Warning,
            OccurrenceCount = 3,
            TotalDurationTicks = TimeSpan.FromMinutes(6).Ticks,
            AverageDurationTicks = TimeSpan.FromMinutes(2).Ticks
        };

        var actual = EventsMapper.Map(source);

        Assert.AreEqual(source.NotificationId, actual.NotificationId);
        Assert.AreEqual(source.Title, actual.Title);
        Assert.AreEqual(source.Level, actual.Level);
        Assert.AreEqual(source.OccurrenceCount, actual.OccurrenceCount);
        Assert.AreEqual(TimeSpan.FromMinutes(6), actual.TotalDuration);
        Assert.AreEqual(TimeSpan.FromMinutes(2), actual.AverageDuration);
    }
}
