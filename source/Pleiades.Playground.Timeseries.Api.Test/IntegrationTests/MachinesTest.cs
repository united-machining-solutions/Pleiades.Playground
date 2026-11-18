using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Timeseries.Api.Services;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Test.IntegrationTests;

/// <summary>
/// <c>DELETE /machines/{serialNumber}</c> deletes the topics below <c>machines/{serialNumber}/</c>, and
/// refuses a serial number that is not one level of a topic. Against a running API, the machine is one
/// that never reported, so nothing of value is deleted.
/// </summary>
[TestClass]
public class MachinesTest : IntegrationTestBase
{
    private const string NoMachine = "delete-test-no-such-machine";
    private static readonly JsonSerializerOptions JsonOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    private static (IDisposable?, HttpClient, Mock<ITimeseriesDbService>?) GetAppFactory()
    {
        if (Containerized)
        {
            return (null, new HttpClient(), null);
        }

        var serviceMock = new Mock<ITimeseriesDbService>();
        serviceMock.Setup(s => s.DeleteByTopicPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TimeseriesDeleteResultDto { ValuesCount = 7 });

        var apiFactory = new WebApplicationFactory<Program>();
        var httpClient = apiFactory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                services.Remove(services.Single(d => d.ServiceType == typeof(ITimeseriesDbService)));
                services.AddSingleton(serviceMock.Object);
            })
            .UseEnvironment("Test");
        }).CreateClient();

        return (apiFactory, httpClient, serviceMock);
    }

    [TestMethod]
    public async Task DeletesTheValuesBelowTheTopicsOfTheMachine()
    {
        var (appFactory, client, serviceMock) = GetAppFactory();

        var response = await client.DeleteAsync(new Uri(BaseUrl + $"machines/{NoMachine}"), TestContext.CancellationToken);

        response.EnsureSuccessStatusCode();
        var content = await response.Content.ReadAsStringAsync(TestContext.CancellationToken);
        var result = JsonSerializer.Deserialize<TimeseriesDeleteResultDto>(content, JsonOptions);
        Assert.IsNotNull(result);
        if (serviceMock is null)
        {
            Assert.AreEqual(0, result.ValuesCount);
        }
        else
        {
            Assert.AreEqual(7, result.ValuesCount);
            serviceMock.Verify(s => s.DeleteByTopicPrefixAsync($"machines/{NoMachine}/", It.IsAny<CancellationToken>()), Times.Once);
        }

        appFactory?.Dispose();
    }

    [TestMethod]
    [DataRow("a+b")]
    [DataRow("a%23b")]
    [DataRow("%20")]
    public async Task RefusesASerialNumberThatIsNotOneLevelOfATopic(string serialNumber)
    {
        var (appFactory, client, serviceMock) = GetAppFactory();

        var response = await client.DeleteAsync(new Uri(BaseUrl + $"machines/{serialNumber}"), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        serviceMock?.Verify(s => s.DeleteByTopicPrefixAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);

        appFactory?.Dispose();
    }

    public TestContext TestContext { get; set; } = null!;
}
