using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.Repositories.NotificationEvent;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.Notification.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test.HostTests;

/// <summary>
/// The developer exception page appears in Development only. <c>Program.cs</c> does not register it:
/// <c>WebApplication</c> does that itself in Development, and Production answers an unhandled exception
/// with 500 and nothing of the exception in the body.
/// </summary>
/// <remarks>
/// <c>GET /notificationEvents</c> does not catch what the repository throws, so a repository mock that throws is
/// enough. The host runs on Kestrel, not on the TestServer: the TestServer hands an unhandled exception to the
/// test's client instead of answering, so only Kestrel shows what a Production caller gets.
/// </remarks>
[TestClass]
public sealed class DeveloperExceptionPageTests
{
    private const string ProbeMessage = "developer exception page probe";

    public required TestContext TestContext { get; set; }

    [TestMethod]
    [DataRow("Development")]
    [DataRow("Production")]
    public async Task AnUnhandledException_ShowsThePageInDevelopmentOnly(string environment)
    {
        var repository = new Mock<INotificationEventRepository>();
        repository.Setup(r => r.QueryEventsWithPaginationAsync(
                It.IsAny<string?>(), It.IsAny<NotificationAction?>(), It.IsAny<string?>(), It.IsAny<EventLevel?>(),
                It.IsAny<DateTime?>(), It.IsAny<DateTime?>(),
                It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException(ProbeMessage));
        await using var factory = ProgramFactory.Create(environment, services =>
        {
            services.RemoveAll<INotificationEventRepository>();
            services.AddSingleton(repository.Object);
        });
        factory.UseKestrel(0);
        using var http = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri("notificationEvents", UriKind.Relative));
        request.Headers.Accept.ParseAdd("text/html");

        using var response = await http.SendAsync(request, TestContext.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.InternalServerError, response.StatusCode);
        if (environment == Environments.Development)
        {
            Assert.Contains(nameof(InvalidOperationException), body, StringComparison.Ordinal);
            Assert.Contains(ProbeMessage, body, StringComparison.Ordinal);
            Assert.Contains("GetNotificationEvents", body, StringComparison.Ordinal);
        }
        else
        {
            Assert.DoesNotContain(nameof(InvalidOperationException), body, StringComparison.Ordinal);
            Assert.DoesNotContain(ProbeMessage, body, StringComparison.Ordinal);
            Assert.DoesNotContain("GetNotificationEvents", body, StringComparison.Ordinal);
        }
    }
}
