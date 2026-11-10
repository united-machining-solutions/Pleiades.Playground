using System.Net;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Pleiades.Playground.Timeseries.Api.Services;

namespace Pleiades.Playground.Timeseries.Api.Test.HostTests;

/// <summary>
/// The developer exception page appears in Development only. <c>Program.cs</c> no
/// longer registers it: <c>WebApplication</c> does that itself in Development, and Production answers an
/// unhandled exception with 500 and nothing of the exception in the body.
/// </summary>
/// <remarks>
/// The REST handlers catch every exception of the database service themselves and answer 500 without a body,
/// so an exception thrown by <see cref="ITimeseriesDbService"/> never reaches the page. This one is thrown while
/// the service is resolved for <c>GET /topics</c>, before the handler runs, the way a broken connection string
/// would surface. The host runs on Kestrel, not on the TestServer: the TestServer hands an unhandled exception
/// to the test's client instead of answering, so only Kestrel shows what a Production caller gets.
/// </remarks>
[TestClass]
public sealed class DeveloperExceptionPageTests
{
    private const string ProbeMessage = "developer exception page probe";

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    [DataRow("Development")]
    [DataRow("Production")]
    public async Task AnUnhandledException_ShowsThePageInDevelopmentOnly(string environment)
    {
        await using var factory = ProgramFactory.Create(environment, services =>
        {
            services.RemoveAll<ITimeseriesDbService>();
            services.AddSingleton<ITimeseriesDbService>(_ => throw new InvalidOperationException(ProbeMessage));
        });
        factory.UseKestrel(0);
        using var http = factory.CreateClient();
        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            new Uri("topics?startTime=2024-12-12T08:00:00Z&stopTime=2024-12-12T09:00:00Z", UriKind.Relative));
        request.Headers.Accept.ParseAdd("text/html");

        using var response = await http.SendAsync(request, TestContext.CancellationToken);
        var body = await response.Content.ReadAsStringAsync(TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.InternalServerError, response.StatusCode);
        if (environment == Environments.Development)
        {
            Assert.Contains(nameof(InvalidOperationException), body, StringComparison.Ordinal);
            Assert.Contains(ProbeMessage, body, StringComparison.Ordinal);
            Assert.Contains(nameof(DeveloperExceptionPageTests), body, StringComparison.Ordinal);
        }
        else
        {
            Assert.DoesNotContain(nameof(InvalidOperationException), body, StringComparison.Ordinal);
            Assert.DoesNotContain(ProbeMessage, body, StringComparison.Ordinal);
            Assert.DoesNotContain(nameof(DeveloperExceptionPageTests), body, StringComparison.Ordinal);
        }
    }
}
