using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Test.IntegrationTests;

[TestClass]
public class TimeSeriesTest : IntegrationTestBase
{
    private static readonly JsonSerializerOptions JsonOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    private (IDisposable?, HttpClient) GetAppFactory()
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

                    serviceMoc.Setup(s => s.GetBaseUnitValuesByTopicAndTimeRangeAsync(It.IsAny<string>(), It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<long>(), It.IsAny<TimeSpan>(), It.IsAny<Sorting>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
                              .ReturnsAsync(new Dictionary<string, BaseUnitSeriesRequestDto>
                              {
                                  {
                                      TestBaseUnitValueModel.Keys.First(),
                                      new BaseUnitSeriesRequestDto
                                      {
                                          DataPoints =
                                          [
                                              new DataPointDto<double>
                                              {
                                                  Timestamp = TestBaseUnitValueModel.Values.First().DataPoints.First().Timestamp,
                                                  Value = TestBaseUnitValueModel.Values.First().DataPoints.First().Value
                                              }
                                          ]
                                      }
                                  }
                              });

                    serviceMoc.Setup(s => s.GetStringValuesByTopicAndTimeRangeAsync(It.IsAny<string>(), It.IsAny<DateTime>(), It.IsAny<DateTime>(), It.IsAny<long>(), It.IsAny<TimeSpan>(), It.IsAny<Sorting>(), It.IsAny<bool>(), It.IsAny<CancellationToken>()))
                              .ReturnsAsync(new Dictionary<string, StringSeriesRequestDto>
                              {
                                  {
                                      TestStringValueModel.Keys.First(),
                                      new StringSeriesRequestDto
                                      {
                                          DataPoints =
                                          [
                                              new DataPointDto<string>
                                              {
                                                  Timestamp = TestStringValueModel.Values.First().DataPoints.First().Timestamp,
                                                  Value = TestStringValueModel.Values.First().DataPoints.First().Value
                                              }
                                          ]
                                      }
                                  }
                              });

                    serviceMoc.Setup(s => s.AddAsync(It.IsAny<Dictionary<string, StringSeriesRequestDto>>(), It.IsAny<CancellationToken>()))
                              .ReturnsAsync(new TimeseriesInsertResultDto
                              {
                                  ValuesCount = 1
                              });

                    serviceMoc.Setup(s => s.AddAsync(It.IsAny<Dictionary<string, BaseUnitSeriesRequestDto>>(), It.IsAny<CancellationToken>()))
                              .ReturnsAsync(new TimeseriesInsertResultDto
                              {
                                  ValuesCount = 1
                              });

                    services.AddTransient(_ => serviceMoc.Object);
                })
                .UseEnvironment("Test");
            }).CreateClient();

            return (apiFactory, httpClient);
        }
    }

    [TestMethod]
    public async Task TestGetBaseUnitValue()
    {
        var (appFactory, client) = GetAppFactory();

        var startTime = Uri.EscapeDataString("2024-07-28T08:20:23.353Z");
        var endTime = Uri.EscapeDataString("2024-10-28T08:22:24.353Z");
        var topic = Uri.EscapeDataString("9000-0101/monitoring/axes/a1/state/feedRate");

        var uri = new Uri(BaseUrl + $"timeseries/baseUnitValues/topics/{topic}?startTime={startTime}&stopTime={endTime}");

        var response = await client.GetAsync(uri).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        var result = JsonSerializer.Deserialize<BaseUnitSeriesResponseDto>(content, JsonOptions);

        Assert.IsTrue(response.IsSuccessStatusCode);
        Assert.IsNotNull(result);
        Assert.HasCount(1, result.Series);
        Assert.AreEqual(TestBaseUnitValueModel.Keys.First(), result.Series[0].Topic);
        Assert.HasCount(1, result.Series[0].Values);

        appFactory?.Dispose();
    }

    [TestMethod]
    public async Task TestGetBaseUnitValueWildcard()
    {
        var (appFactory, client) = GetAppFactory();

        var startTime = Uri.EscapeDataString("2024-07-28T08:20:23.353Z");
        var endTime = Uri.EscapeDataString("2024-10-28T08:22:24.353Z");
        var topic = Uri.EscapeDataString("9000-0101*");

        var uri = new Uri(BaseUrl + $"timeseries/baseUnitValues/topics/{topic}?startTime={startTime}&stopTime={endTime}");

        var response = await client.GetAsync(uri, TestContext.CancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync(TestContext.CancellationToken).ConfigureAwait(false);
        var result = JsonSerializer.Deserialize<BaseUnitSeriesResponseDto>(content, JsonOptions);

        Assert.IsTrue(response.IsSuccessStatusCode);
        Assert.IsNotNull(result);
        Assert.HasCount(1, result.Series);
        Assert.AreEqual(TestBaseUnitValueModel.Keys.First(), result.Series[0].Topic);
        Assert.HasCount(1, result.Series[0].Values);

        appFactory?.Dispose();
    }

    [TestMethod]
    public async Task TestPostBaseUnitValue()
    {
        var uri = new Uri(BaseUrl + $"timeseries/baseUnitValues");
        using var content = JsonContent.Create(TestBaseUnitValueModel);
        var (appFactory, client) = GetAppFactory();

        HttpResponseMessage response = await client.PostAsync(uri, content, TestContext.CancellationToken).ConfigureAwait(false);
        var stringResult = await response.Content.ReadAsStringAsync(TestContext.CancellationToken).ConfigureAwait(false);
        var result = JsonSerializer.Deserialize<TimeseriesInsertResultDto>(stringResult, JsonOptions);

        Assert.IsNotNull(result);
        Assert.AreEqual(1, result.ValuesCount);

        appFactory?.Dispose();
    }

    [TestMethod]
    public async Task TestGetStringValues()
    {
        var (appFactory, client) = GetAppFactory();
        var startTime = Uri.EscapeDataString("2024-07-28T08:20:23.353Z");
        var endTime = Uri.EscapeDataString("2024-10-28T08:22:24.353Z");
        var topic = Uri.EscapeDataString("9000-0101/monitoring/axes/a1/state/feedRate");

        var uri = new Uri(BaseUrl + $"timeseries/stringValues/topics/{topic}?startTime={startTime}&stopTime={endTime}");
        var response = await client.GetAsync(uri).ConfigureAwait(false);

        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        var result = JsonSerializer.Deserialize<StringSeriesResponseDto>(content, JsonOptions);

        Assert.IsNotNull(result);
        Assert.HasCount(1, result.Series);
        Assert.AreEqual(TestStringValueModel.Keys.First(), result.Series[0].Topic);
        Assert.HasCount(1, result.Series[0].Values);
        Assert.IsTrue(response.IsSuccessStatusCode);

        appFactory?.Dispose();
    }

    [TestMethod]
    public async Task TestGetStringValuesByWildCard()
    {
        var (appFactory, client) = GetAppFactory();
        var startTime = Uri.EscapeDataString("2024-07-28T08:20:23.353Z");
        var endTime = Uri.EscapeDataString("2024-10-28T08:22:24.353Z");
        var topic = Uri.EscapeDataString("9000-0101*");

        var uri = new Uri(BaseUrl + $"timeseries/stringValues/topics/{topic}?startTime={startTime}&stopTime={endTime}");
        var response = await client.GetAsync(uri).ConfigureAwait(false);

        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        var result = JsonSerializer.Deserialize<StringSeriesResponseDto>(content, JsonOptions);

        Assert.IsNotNull(result);
        Assert.HasCount(1, result.Series);
        Assert.AreEqual(TestStringValueModel.Keys.First(), result.Series[0].Topic);
        Assert.HasCount(1, result.Series[0].Values);
        Assert.IsTrue(response.IsSuccessStatusCode);

        appFactory?.Dispose();
    }

    [TestMethod]
    public async Task TestPostStringValue()
    {
        var uri = new Uri(BaseUrl + "timeseries/stringValues");
        using var content = JsonContent.Create(TestStringValueModel);
        var (appFactory, client) = GetAppFactory();

        HttpResponseMessage response = await client.PostAsync(uri, content).ConfigureAwait(false);
        var responseContent = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        var result = JsonSerializer.Deserialize<TimeseriesInsertResultDto>(responseContent, JsonOptions);

        Assert.AreEqual(System.Net.HttpStatusCode.Created, response.StatusCode);
        Assert.IsNotNull(result);
        Assert.AreEqual(1, result.ValuesCount);

        appFactory?.Dispose();
    }

    public TestContext TestContext { get; set; }
}
