using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Timeseries.Api.Client.BooleanValue;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client.Test;

[TestClass]
public class ApiBooleanValueServiceTests

{
    public TestContext TestContext { get; set; }

    public static readonly IFormatProvider invariantCultureProvider = CultureInfo.InvariantCulture;

    [SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope",
        Justification = "WithWebHostBuilder manages parent factory lifecycle")]
    private static WebApplicationFactory<Program> CreateAppFactory()
    {
        var apiFactory = new WebApplicationFactory<Program>();

        return apiFactory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.Remove(services.Single(d => d.ServiceType == typeof(ITimeseriesDbService)));

                var serviceMoc = new Mock<ITimeseriesDbService>();

                serviceMoc.Setup(s => s.GetBooleanValuesByTopicAndTimeRangeAsync(It.IsAny<string>(), It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<long>(), It.IsAny<TimeSpan>(), It.IsAny<Sorting>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync(new Dictionary<string, BooleanSeriesRequestDto>
                    {
                        {
                            "test/topic",
                            new BooleanSeriesRequestDto
                            {
                                DataPoints =
                                [
                                    new DataPointDto<bool>
                                    {
                                        Timestamp = DateTime.Parse("2024-10-28T08:22:23.353Z", invariantCultureProvider),
                                        Value = true
                                    }
                                ]
                            }
                        }
                    });

                serviceMoc.Setup(s => s.AddAsync(It.IsAny<Dictionary<string, BooleanSeriesRequestDto>>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync((Dictionary<string, BooleanSeriesRequestDto> booleanValues, CancellationToken _) =>
                        new TimeseriesInsertResultDto
                        {
                            ValuesCount = booleanValues.Values.Sum(ds => ds.DataPoints.Count)
                        });
                services.AddSingleton(serviceMoc.Object);
            }).UseEnvironment("Test");
        });
    }

    [TestMethod]
    public async Task PostBooleanValues()
    {
        var booleanValues = new Dictionary<string, BooleanSeriesRequestDto>
        {
            {
                "test/topic",
                new BooleanSeriesRequestDto
                {
                    DataPoints =
                    [
                        new DataPointDto<bool>
                        {
                            Timestamp = DateTime.UtcNow,
                            Value = true
                        }
                    ]
                }
            }
        };

        using var apiFactory = CreateAppFactory();
        var apiClient = new BooleanValueApiService(apiFactory.CreateClient());

        var expectedResponse = new TimeseriesInsertResultDto { ValuesCount = 1 };

        var dto = await apiClient.PostBooleanValues(booleanValues, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        Assert.AreEqual(expectedResponse.ValuesCount, dto.ValuesCount);
    }

    [TestMethod]
    public async Task FindBooleanValuesByTopicAndTimeRange()
    {
        var topic = "test/topic";
        var startTime = DateTime.UtcNow.AddHours(-1);
        var stopTime = DateTime.UtcNow;

        using var apiFactory = CreateAppFactory();
        var apiClient = new BooleanValueApiService(apiFactory.CreateClient());
        long limit = 1;

        var dto = await apiClient.FindBooleanValuesByTopicAndTimeRange(topic, startTime, stopTime, limit, Sorting.Descending, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        Assert.IsNotNull(dto.Series);
        Assert.HasCount(1, dto.Series);
        var series = dto.Series[0];
        Assert.AreEqual("test/topic", series.Topic);
        Assert.IsTrue(series.Values[0]);
    }

    [TestMethod]
    public async Task FindBooleanValuesByWildCard()
    {
        var topic = "test*";
        var startTime = DateTime.UtcNow.AddHours(-1);
        var stopTime = DateTime.UtcNow;
        long limit = 1;
        using var apiFactory = CreateAppFactory();
        var apiClient = new BooleanValueApiService(apiFactory.CreateClient());

        var dto = await apiClient.FindBooleanValuesByTopicAndTimeRange(topic, startTime, stopTime, limit, Sorting.Descending, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        Assert.IsNotNull(dto.Series);
        Assert.HasCount(1, dto.Series);
        var series = dto.Series[0];
        Assert.AreEqual("test/topic", series.Topic);
        Assert.IsTrue(series.Values[0]);
    }
}
