using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client.Test;

[TestClass]
public class ApiTopicsServiceTests
{
    public TestContext TestContext { get; set; }

    [SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope",
        Justification = "WithWebHostBuilder manages parent factory lifecycle")]
    private static WebApplicationFactory<Program> CreateAppFactory(TopicsDto mockTopics)
    {
        var apiFactory = new WebApplicationFactory<Program>();

        return apiFactory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.Remove(services.Single(d => d.ServiceType == typeof(ITimeseriesDbService)));

                var serviceMoc = new Mock<ITimeseriesDbService>();

                serviceMoc.Setup(s => s.GetTopicsByTimeRangeAsync(It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<TimeSpan>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync(mockTopics);

                services.AddSingleton(serviceMoc.Object);
            }).UseEnvironment("Test");
        });
    }

    [TestMethod]
    public async Task FindTopicsByTimeRangeReturnsMockedTopics()
    {
        var mockTopics = new TopicsDto
        {
            BaseUnitTopics = ["a/base", "b/base"],
            StringTopics = ["a/string"],
            BooleanTopics = ["flag/door"]
        };

        using var apiFactory = CreateAppFactory(mockTopics);
        var apiClient = new TopicsApiService(apiFactory.CreateClient());

        var start = DateTime.UtcNow.AddHours(-1);
        var stop = DateTime.UtcNow;
        var dto = await apiClient.FindTopicsByTimeRange(start, stop, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        CollectionAssert.AreEquivalent(mockTopics.BaseUnitTopics, dto.BaseUnitTopics);
        CollectionAssert.AreEquivalent(mockTopics.StringTopics, dto.StringTopics);
        CollectionAssert.AreEquivalent(mockTopics.BooleanTopics, dto.BooleanTopics);
    }

    [TestMethod]
    public async Task FindTopicsByTimeRangeEmptyLists()
    {
        var mockTopics = new TopicsDto();
        using var apiFactory = CreateAppFactory(mockTopics);
        var apiClient = new TopicsApiService(apiFactory.CreateClient());

        var start = DateTime.UtcNow.AddHours(-1);
        var stop = DateTime.UtcNow;
        var dto = await apiClient.FindTopicsByTimeRange(start, stop, TestContext.CancellationToken).ConfigureAwait(false);
        Assert.IsNotNull(dto);
        Assert.IsEmpty(dto.BaseUnitTopics);
        Assert.IsEmpty(dto.StringTopics);
        Assert.IsEmpty(dto.BooleanTopics);
    }
}
