using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Test.IntegrationTests;

[TestClass]
public class TopicsTest : IntegrationTestBase
{
    private static readonly JsonSerializerOptions JsonOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    private (IDisposable?, HttpClient) GetAppFactory(TopicsDto topics)
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
                    services.Remove(services.Single(d => d.ServiceType == typeof(ITimeseriesDbService)));

                    var serviceMoc = new Mock<ITimeseriesDbService>();
                    serviceMoc.Setup(s => s.GetTopicsByTimeRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
                        .ReturnsAsync(topics);
                    services.AddSingleton(serviceMoc.Object);
                })
                .UseEnvironment("Test");
            }).CreateClient();

            return (apiFactory, httpClient);
        }
    }

    [TestMethod]
    public async Task TestGetTopics()
    {
        var expected = new TopicsDto
        {
            BaseUnitTopics = ["b/base", "a/base"],
            StringTopics = ["c/string"],
            BooleanTopics = ["door/open"]
        };

        var (appFactory, client) = GetAppFactory(expected);

        var startTime = Uri.EscapeDataString("2025-09-01T00:00:00Z");
        var endTime = Uri.EscapeDataString("2025-09-02T00:00:00Z");
        var uri = new Uri(BaseUrl + $"topics?startTime={startTime}&stopTime={endTime}");

        var response = await client.GetAsync(uri, TestContext.CancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync(TestContext.CancellationToken).ConfigureAwait(false);

        var result = JsonSerializer.Deserialize<TopicsDto>(content, JsonOptions);
        Assert.IsNotNull(result);
        CollectionAssert.AreEquivalent(expected.BaseUnitTopics, result!.BaseUnitTopics);
        CollectionAssert.AreEquivalent(expected.StringTopics, result.StringTopics);
        CollectionAssert.AreEquivalent(expected.BooleanTopics, result.BooleanTopics);

        appFactory?.Dispose();
    }

    [TestMethod]
    public async Task TestGetTopicsEmpty()
    {
        var expected = new TopicsDto();
        var (appFactory, client) = GetAppFactory(expected);
        var startTime = Uri.EscapeDataString("2025-09-01T00:00:00Z");
        var endTime = Uri.EscapeDataString("2025-09-02T00:00:00Z");
        var uri = new Uri(BaseUrl + $"topics?startTime={startTime}&stopTime={endTime}");

        var response = await client.GetAsync(uri, TestContext.CancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync(TestContext.CancellationToken).ConfigureAwait(false);
        var result = JsonSerializer.Deserialize<TopicsDto>(content, JsonOptions);

        Assert.IsNotNull(result);
        Assert.IsEmpty(result!.BaseUnitTopics);
        Assert.IsEmpty(result.StringTopics);
        Assert.IsEmpty(result.BooleanTopics);

        appFactory?.Dispose();
    }

    public TestContext TestContext { get; set; }
}
