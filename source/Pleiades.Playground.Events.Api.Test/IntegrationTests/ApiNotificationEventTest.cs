using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Repositories.NotificationEvent;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test.IntegrationTests;

[TestClass]
public class ApiNotificationEventTest : IntegrationTestBase
{
    // A machine of its own: against a running API, the delete must not take the events of the other tests.
    private const string DeleteTestMachine = "delete-test-no-such-machine";

    public required TestContext TestContext { get; set; }

    private static (IDisposable?, HttpClient) GetAppFactory()
    {
        if (Containerized)
        {
            return (null, new HttpClient());
        }
        else
        {
            var apiFactory = new WebApplicationFactory<Program>();
            var httpClient = apiFactory.WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    services.Remove(services.Single(d => d.ServiceType == typeof(INotificationEventRepository)));

                    var serviceMock = new Mock<INotificationEventRepository>();

                    serviceMock.Setup(s => s.CreateAsync(It.Is<NotificationEventDao>(e => e.Id == NotificationTestEvent.Id), It.IsAny<CancellationToken>()))
                               .Throws(new PleiadesDuplicateDataException());

                    serviceMock.Setup(s => s.CreateAsync(It.Is<NotificationEventDao>(e => e.Id != NotificationTestEvent.Id), It.IsAny<CancellationToken>()))
                               .Callback((NotificationEventDao dao, CancellationToken _) => dao.Id = ObjectId.GenerateNewId().ToString());

                    serviceMock.Setup(s => s.CreateManyAsync(It.Is<IEnumerable<NotificationEventDao>>(events => events.Any(e => e.Id == NotificationTestEvent.Id)), It.IsAny<CancellationToken>()))
                               .Throws(new PleiadesDuplicateDataException("Some notification events already exist."));

                    serviceMock.Setup(s => s.CreateManyAsync(It.Is<IEnumerable<NotificationEventDao>>(events => events.All(e => e.Id != NotificationTestEvent.Id)), It.IsAny<CancellationToken>()))
                               .Callback((IEnumerable<NotificationEventDao> daos, CancellationToken _) =>
                               {
                                   foreach (var dao in daos)
                                   {
                                       dao.Id = ObjectId.GenerateNewId().ToString();
                                   }
                               });

                    serviceMock.Setup(s => s.DeleteByMachineAsync(DeleteTestMachine, It.IsAny<CancellationToken>()))
                               .ReturnsAsync(3);

                    services.AddSingleton(serviceMock.Object);
                }).UseEnvironment("Test");
            }).CreateClient();

            return (apiFactory, httpClient);
        }
    }

    [TestMethod]
    public async Task PostNotificationEvent_NewEvent_ReturnsCreated()
    {
        (var factory, var httpClient) = GetAppFactory();

        var notificationEvent = new NotificationEventDtoV1
        {
            Id = ObjectId.GenerateNewId().ToString(),
            Title = "New Notification Event",
            Timestamp = DateTime.Now
        };

        using var content = JsonContent.Create(notificationEvent);
        var response = await httpClient.PostAsync(new Uri(BaseUrl, "/notificationEvents"), content, TestContext.CancellationToken);

        Assert.AreEqual(System.Net.HttpStatusCode.Created, response.StatusCode);

        factory?.Dispose();
        httpClient?.Dispose();
    }

    [TestMethod]
    public async Task PostNotificationEvent_DuplicateEvent_ReturnsConflict()
    {
        (var factory, var httpClient) = GetAppFactory();

        using var content = JsonContent.Create(NotificationTestEvent);
        var response = await httpClient.PostAsync(new Uri(BaseUrl, "/notificationEvents"), content, TestContext.CancellationToken);

        Assert.AreEqual(System.Net.HttpStatusCode.Conflict, response.StatusCode);

        factory?.Dispose();
        httpClient?.Dispose();
    }

    [TestMethod]
    public async Task BulkPostNotificationEvents_NewEvents_ReturnsCreated()
    {
        (var factory, var httpClient) = GetAppFactory();

        var notificationEvents = new List<NotificationEventDtoV1>
        {
            new()
            {
                Id = ObjectId.GenerateNewId().ToString(),
                Title = "Bulk Notification Event 1",
                Timestamp = DateTime.Now,
                Action = NotificationAction.Raised,
                NotificationId = "bulk-001"
            },
            new()
            {
                Id = ObjectId.GenerateNewId().ToString(),
                Title = "Bulk Notification Event 2",
                Timestamp = DateTime.Now,
                Action = NotificationAction.Raised,
                NotificationId = "bulk-002"
            }
        };

        using var content = JsonContent.Create(notificationEvents);
        var response = await httpClient.PostAsync(new Uri(BaseUrl, "/notificationEvents/bulk"), content, TestContext.CancellationToken);

        Assert.AreEqual(System.Net.HttpStatusCode.Created, response.StatusCode);

        factory?.Dispose();
        httpClient?.Dispose();
    }

    [TestMethod]
    public async Task BulkPostNotificationEvents_WithDuplicates_ReturnsConflict()
    {
        (var factory, var httpClient) = GetAppFactory();

        var notificationEvents = new List<NotificationEventDtoV1>
        {
            new()
            {
                Id = NotificationTestEvent.Id, // This should cause a duplicate conflict
                Title = "Duplicate Notification Event",
                Timestamp = DateTime.Now,
                Action = NotificationAction.Raised,
                NotificationId = "duplicate-001"
            },
            new()
            {
                Id = ObjectId.GenerateNewId().ToString(),
                Title = "Valid Notification Event",
                Timestamp = DateTime.Now,
                Action = NotificationAction.Raised,
                NotificationId = "valid-001"
            }
        };

        using var content = JsonContent.Create(notificationEvents);
        var response = await httpClient.PostAsync(new Uri(BaseUrl, "/notificationEvents/bulk"), content, TestContext.CancellationToken);

        Assert.AreEqual(System.Net.HttpStatusCode.Conflict, response.StatusCode);

        factory?.Dispose();
        httpClient?.Dispose();
    }

    [TestMethod]
    public async Task DeleteMachineNotificationEvents_ReturnsTheCount()
    {
        var (factory, httpClient) = GetAppFactory();

        var response = await httpClient.DeleteAsync(new Uri(BaseUrl, $"/notificationEvents/machines/{DeleteTestMachine}"), TestContext.CancellationToken);

        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<NotificationEventsDeleteResultDtoV1>(TestContext.CancellationToken);
        Assert.IsNotNull(result);
        Assert.AreEqual(Containerized ? 0 : 3, result.EventsCount);

        factory?.Dispose();
        httpClient?.Dispose();
    }

    [TestMethod]
    [DataRow("a+b")]
    [DataRow("a%23b")]
    [DataRow("%20")]
    public async Task DeleteMachineNotificationEvents_NotOneLevelOfATopic_ReturnsBadRequest(string mId)
    {
        var (factory, httpClient) = GetAppFactory();

        var response = await httpClient.DeleteAsync(new Uri(BaseUrl, $"/notificationEvents/machines/{mId}"), TestContext.CancellationToken);

        Assert.AreEqual(System.Net.HttpStatusCode.BadRequest, response.StatusCode);

        factory?.Dispose();
        httpClient?.Dispose();
    }
}
