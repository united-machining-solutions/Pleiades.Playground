using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Client.NotificationEvents;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.Test;

[TestClass]
public class NotificationEventApiServiceTest
{
    private readonly List<NotificationEventDtoV1> _events =
        [
            new NotificationEventDtoV1
            {
                Action = NotificationAction.Raised,
                Title = "Alarm 1",
                Timestamp = DateTime.Now,
                NotificationId = "999999"
            },
            new NotificationEventDtoV1
            {
                Action= NotificationAction.Reset,
                Title = "Alarm 1",
                Timestamp = DateTime.Now.AddMinutes(-5),
                NotificationId = "999999"
            }
       ];

    private Mock<INotificationEventService> CreateMockService()
    {
        var mockService = new Mock<INotificationEventService>();

        mockService.Setup(s => s.PostEvent(It.IsAny<NotificationEventDtoV1>()))
            .ReturnsAsync((NotificationEventDtoV1 evt) => evt);

        mockService.Setup(s => s.FindAllEvents())
            .ReturnsAsync(new PagedResponse<NotificationEventDtoV1>(_events, _events.Count, 0, 100));

        return mockService;
    }

    [TestMethod]
    public async Task PostEventShouldReturnPostedNotificationEvent()
    {
        // Arrange
        var mockService = CreateMockService();
        var mockEvent = new NotificationEventDtoV1
        {
            Id = Guid.NewGuid().ToString(),
            Title = "New Notification Event",
            Timestamp = DateTime.Now
        };

        // Act
        var result = await mockService.Object.PostEvent(mockEvent);

        // Assert
        Assert.IsNotNull(result);
        Assert.AreEqual(mockEvent.Id, result.Id);
        Assert.AreEqual(mockEvent.Title, result.Title);
        Assert.AreEqual(mockEvent.Timestamp, result.Timestamp);
    }

    [TestMethod]
    public async Task GetAllEventsShouldReturnAllNotificationEvents()
    {
        // Arrange
        var mockService = CreateMockService();

        // Act
        var result = await mockService.Object.FindAllEvents();

        // Assert
        Assert.IsNotNull(result);
        Assert.HasCount(2, result.Items);
        Assert.AreEqual(NotificationAction.Raised, result.Items[0].Action);
        Assert.AreEqual(NotificationAction.Reset, result.Items[1].Action);
    }

    [TestMethod]
    public async Task QueryPairedEventsAsyncShouldReturnPairedNotificationEvents()
    {
        // Arrange
        var pairedEvents = new List<PairedNotificationEventDtoV1>
        {
            new()
            {
                CorrelationId = "corr-1",
                MId = "9000-0001",
                NotificationId = "msg-1",
                Level = EventLevel.Warning,
                Title = "Alarm 1",
                TimestampRaised = DateTime.UtcNow.AddMinutes(-10),
                TimestampGone = DateTime.UtcNow.AddMinutes(-5),
                Duration = TimeSpan.FromMinutes(5)
            },
            new()
            {
                CorrelationId = "corr-2",
                MId = "9000-0001",
                NotificationId = "msg-2",
                Level = EventLevel.Error,
                Title = "Alarm 2",
                TimestampRaised = DateTime.UtcNow.AddMinutes(-3),
                TimestampGone = null,
                Duration = null
            }
        };

        var mockService = new Mock<INotificationEventService>();
        mockService.Setup(s => s.QueryPairedEventsAsync(
                It.IsAny<string?>(), It.IsAny<string?>(), It.IsAny<EventLevel?>(),
                It.IsAny<DateTime?>(), It.IsAny<DateTime?>(),
                It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PagedResponse<PairedNotificationEventDtoV1>(pairedEvents, pairedEvents.Count, 0, 100));

        // Act
        var result = await mockService.Object.QueryPairedEventsAsync(
            "9000-0001", null, null, null, null, 0, 100, Sorting.Ascending, CancellationToken.None);

        // Assert
        Assert.IsNotNull(result);
        Assert.HasCount(2, result.Items);
        Assert.AreEqual("corr-1", result.Items[0].CorrelationId);
        Assert.AreEqual(EventLevel.Warning, result.Items[0].Level);
        Assert.IsNotNull(result.Items[0].TimestampGone);
        Assert.AreEqual("corr-2", result.Items[1].CorrelationId);
        Assert.IsNull(result.Items[1].TimestampGone);
    }

    [TestMethod]
    public async Task QueryPairedEventsAsyncConvenienceOverloadShouldUseDefaults()
    {
        // Arrange
        var mockService = new Mock<INotificationEventService>();
        mockService.Setup(s => s.QueryPairedEventsAsync(
                It.IsAny<string?>(), It.IsAny<DateTime?>(), It.IsAny<DateTime?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PagedResponse<PairedNotificationEventDtoV1>([], 0, 0, 1000));

        // Act
        var result = await mockService.Object.QueryPairedEventsAsync(
            "9000-0001", DateTime.UtcNow.AddDays(-1), DateTime.UtcNow, CancellationToken.None);

        // Assert
        Assert.IsNotNull(result);
        Assert.HasCount(0, result.Items);
    }
}
