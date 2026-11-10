using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Timeseries.Api.Client.BaseUnitValue;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client.Test;

[TestClass]
public class ApiBaseUnitValueServiceTests

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

                serviceMoc.Setup(s => s.GetBaseUnitValuesByTopicAndTimeRangeAsync(It.IsAny<string>(), It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<long>(), It.IsAny<TimeSpan>(), It.IsAny<Sorting>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync(new Dictionary<string, BaseUnitSeriesRequestDto>
                    {
                        {
                            "test/topic",
                            new BaseUnitSeriesRequestDto
                            {
                                DataPoints =
                                [
                                    new DataPointDto<double>
                                    {
                                        Timestamp = DateTime.Parse("2024-10-28T08:22:23.353Z", invariantCultureProvider),
                                        Value = 1.0
                                    }
                                ]
                            }
                        }
                    });

                serviceMoc.Setup(s => s.AddAsync(It.IsAny<Dictionary<string, BaseUnitSeriesRequestDto>>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync((Dictionary<string, BaseUnitSeriesRequestDto> baseUnitValues, CancellationToken _) =>
                        new TimeseriesInsertResultDto
                        {
                            ValuesCount = baseUnitValues.Values.Sum(ds => ds.DataPoints.Count)
                        });
                services.AddSingleton(serviceMoc.Object);
            }).UseEnvironment("Test");
        });
    }

    [TestMethod]
    public async Task PostBaseUnitValues()
    {
        var baseUnitValues = new Dictionary<string, BaseUnitSeriesRequestDto>
        {
            {
                "test/topic",
                new BaseUnitSeriesRequestDto
                {
                    DataPoints =
                    [
                        new DataPointDto<double>
                        {
                            Timestamp = DateTime.UtcNow,
                            Value = 100.0
                        }
                    ]
                }
            }
        };

        using var apiFactory = CreateAppFactory();
        var apiClient = new BaseUnitValueApiService(apiFactory.CreateClient());

        var expectedResponse = new TimeseriesInsertResultDto { ValuesCount = 1 };

        var dto = await apiClient.PostBaseUnitValues(baseUnitValues, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        Assert.AreEqual(expectedResponse.ValuesCount, dto.ValuesCount);
    }

    [TestMethod]
    public async Task FindBaseUnitValuesByTopicAndTimeRange()
    {
        var topic = "test/topic";
        var startTime = DateTime.UtcNow.AddHours(-1);
        var stopTime = DateTime.UtcNow;

        using var apiFactory = CreateAppFactory();
        var apiClient = new BaseUnitValueApiService(apiFactory.CreateClient());
        long limit = 1;

        var dto = await apiClient.FindBaseUnitValuesByTopicAndTimeRange(topic, startTime, stopTime, limit, Sorting.Descending, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        Assert.IsNotNull(dto.Series);
        Assert.HasCount(1, dto.Series);
        var series = dto.Series[0];
        Assert.AreEqual("test/topic", series.Topic);
        Assert.AreEqual(1, series.Count);
        Assert.AreEqual(1.0, series.Values[0]);
    }

    [TestMethod]
    public async Task FindBaseUnitValuesByWildCard()
    {
        var topic = "test*";
        var startTime = DateTime.UtcNow.AddHours(-1);
        var stopTime = DateTime.UtcNow;
        long limit = 1;
        using var apiFactory = CreateAppFactory();
        var apiClient = new BaseUnitValueApiService(apiFactory.CreateClient());

        var dto = await apiClient.FindBaseUnitValuesByTopicAndTimeRange(topic, startTime, stopTime, limit, Sorting.Descending, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        Assert.IsNotNull(dto.Series);
        Assert.HasCount(1, dto.Series);
        var series = dto.Series[0];
        Assert.AreEqual("test/topic", series.Topic);
        Assert.AreEqual(1.0, series.Values[0]);
    }
}
