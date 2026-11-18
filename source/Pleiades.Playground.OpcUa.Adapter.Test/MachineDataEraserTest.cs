using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.Logging.Loki.Configuration;
using Pleiades.Playground.Mqtt.Extensions;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public class MachineDataEraserTest
{
    private sealed class Stores(Func<HttpRequestMessage, HttpResponseMessage> answer) : HttpMessageHandler
    {
        public List<string> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add($"{request.Method} {request.RequestUri}");
            return Task.FromResult(answer(request));
        }
    }

    private static HttpResponseMessage Json(string body) =>
        new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };

    private static MachineDataEraser Eraser(Stores stores, bool withEvents = true) =>
        new(new HttpClient(stores), Options.Create(new Config
        {
            MqttDestination = new MqttConfig(),
            Loki = new SerilogLokiConfig { Sinks = [] },
            TimeseriesApi = new ApiConfig { Uri = new Uri("http://timeseries-api:8080") },
            EventsApi = withEvents ? new ApiConfig { Uri = new Uri("http://events-api:8080/") } : null,
        }));

    [TestMethod]
    public async Task The_values_and_the_notifications_of_the_machine_are_deleted_by_the_APIs()
    {
        using var stores = new Stores(request => request.RequestUri!.Host == "timeseries-api"
            ? Json("""{"valuesCount": 42}""")
            : Json("""{"eventsCount": 3}"""));

        var deletion = await Eraser(stores).DeleteAsync("A1121O0001", CancellationToken.None);

        Assert.AreEqual(42, deletion.ValuesDeleted);
        Assert.AreEqual(3, deletion.EventsDeleted);
        Assert.IsEmpty(deletion.Problems);
        CollectionAssert.AreEqual(
            new[]
            {
                "DELETE http://timeseries-api:8080/machines/A1121O0001",
                "DELETE http://events-api:8080/machineEvents/machines/A1121O0001",
            },
            stores.Requests);
    }

    [TestMethod]
    public async Task A_store_that_fails_is_named_and_the_other_is_deleted_all_the_same()
    {
        using var stores = new Stores(request => request.RequestUri!.Host == "timeseries-api"
            ? new HttpResponseMessage(HttpStatusCode.InternalServerError)
            : Json("""{"eventsCount": 1}"""));

        var deletion = await Eraser(stores).DeleteAsync("A1121O0001", CancellationToken.None);

        Assert.IsNull(deletion.ValuesDeleted);
        Assert.AreEqual(1, deletion.EventsDeleted);
        StringAssert.Contains(deletion.Problems.Single(), "Timeseries API answered 500", StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task Without_the_address_of_a_store_its_data_stays_and_the_removal_says_so()
    {
        using var stores = new Stores(_ => Json("""{"valuesCount": 0}"""));

        var deletion = await Eraser(stores, withEvents: false).DeleteAsync("M1", CancellationToken.None);

        Assert.AreEqual(0, deletion.ValuesDeleted);
        Assert.IsNull(deletion.EventsDeleted);
        StringAssert.Contains(deletion.Problems.Single(), "Config:EventsApi:Uri", StringComparison.Ordinal);
        Assert.AreEqual("DELETE http://timeseries-api:8080/machines/M1", stores.Requests.Single());
    }

    [TestMethod]
    public async Task A_store_that_cannot_be_reached_is_a_problem_and_not_an_exception()
    {
        using var stores = new Stores(_ => throw new HttpRequestException("connection refused"));

        var deletion = await Eraser(stores).DeleteAsync("A1121O0001", CancellationToken.None);

        Assert.HasCount(2, deletion.Problems);
        StringAssert.Contains(deletion.Problems[0], "connection refused", StringComparison.Ordinal);
    }
}
