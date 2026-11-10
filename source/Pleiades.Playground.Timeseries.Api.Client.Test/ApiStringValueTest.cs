using System.Diagnostics.CodeAnalysis;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Timeseries.Api.Client.StringValue;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client.Test;

[TestClass]
public class ApiStringValueServiceTests
{
    public TestContext TestContext { get; set; }

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

                serviceMoc.Setup(s => s.GetStringValuesByTopicAndTimeRangeAsync(It.IsAny<string>(), It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<long>(), It.IsAny<TimeSpan>(), It.IsAny<Sorting>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync(new Dictionary<string, StringSeriesRequestDto>
                    {
                        {
                            "test/topic",
                            new StringSeriesRequestDto
                            {
                                DataPoints =
                                [
                                    new DataPointDto<string>
                                    {
                                        Timestamp = DateTime.UtcNow,
                                        Value = "test_value"
                                    }
                                ]
                            }
                        }
                    });

                serviceMoc.Setup(s => s.AddAsync(It.IsAny<Dictionary<string, StringSeriesRequestDto>>(), It.IsAny<CancellationToken>()))
                    .ReturnsAsync((Dictionary<string, StringSeriesRequestDto> stringValues, CancellationToken _) =>
                        new TimeseriesInsertResultDto
                        {
                            ValuesCount = stringValues.Values.Sum(ds => ds.DataPoints.Count)
                        });

                services.AddSingleton(serviceMoc.Object);
            }).UseEnvironment("Test");
        });
    }

    [TestMethod]
    public async Task PostStringValuesInsert()
    {
        var stringValues = new Dictionary<string, StringSeriesRequestDto>
        {
            {
                "test/topic",
                new StringSeriesRequestDto
                {
                    DataPoints =
                    [
                        new DataPointDto<string>
                        {
                            Timestamp = DateTime.UtcNow,
                            Value = "test_value"
                        }
                    ]
                }
            }
        };

        using var apiFactory = CreateAppFactory();
        var apiClient = new StringValueApiService(apiFactory.CreateClient());

        var expectedResponse = new TimeseriesInsertResultDto { ValuesCount = 1 };

        var dto = await apiClient.PostStringValues(stringValues, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        Assert.AreEqual(expectedResponse.ValuesCount, dto.ValuesCount);
    }

    [TestMethod]
    public async Task FindStringValuesByTopicAndTimeRange()
    {
        var topic = "test/topic";
        var startTime = DateTime.UtcNow.AddHours(-1);
        var stopTime = DateTime.UtcNow;

        using var apiFactory = CreateAppFactory();
        var apiClient = new StringValueApiService(apiFactory.CreateClient());

        var dto = await apiClient.FindStringValuesByTopicAndTimeRange(topic, startTime, stopTime, 1, Sorting.Descending, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        Assert.IsNotNull(dto.Series);
        Assert.HasCount(1, dto.Series);
        var series = dto.Series[0];
        Assert.AreEqual("test/topic", series.Topic);
        Assert.AreEqual("test_value", series.Values[0]);
    }

    [TestMethod]
    public async Task FindStringValuesByWildCard()
    {
        var topic = "test*";
        var startTime = DateTime.UtcNow.AddHours(-1);
        var stopTime = DateTime.UtcNow;

        using var apiFactory = CreateAppFactory();
        var apiClient = new StringValueApiService(apiFactory.CreateClient());

        var dto = await apiClient.FindStringValuesByTopicAndTimeRange(topic, startTime, stopTime, 1, Sorting.Descending, TestContext.CancellationToken).ConfigureAwait(false);

        Assert.IsNotNull(dto);
        Assert.IsNotNull(dto.Series);
        Assert.HasCount(1, dto.Series);
        var series = dto.Series[0];
        Assert.AreEqual("test/topic", series.Topic);
        Assert.AreEqual("test_value", series.Values[0]);
    }
}
