// SPDX-License-Identifier: Apache-2.0
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Repositories.MachineEvent;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test.IntegrationTests;

/// <summary>
/// The endpoints of the CloudEvents of machines and of the views, with the repository mocked: what goes to it, and
/// what the views make of what it returns.
/// </summary>
[TestClass]
public sealed class ApiMachineEventTest
{
    private static readonly JsonSerializerOptions Json = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;
    private const string Machine = MachineEventSamples.MachineId;

    public required TestContext TestContext { get; set; }

    private sealed class Api : IDisposable
    {
        private readonly WebApplicationFactory<Program> _factory;

        [System.Diagnostics.CodeAnalysis.SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope",
            Justification = "WithWebHostBuilder manages the lifecycle of the parent factory")]
        public Api()
        {
            Repository = new Mock<IMachineEventRepository>();
            Repository.Setup(r => r.CreateAsync(It.Is<MachineEventDao>(e => e.EventId == "stored-before"), It.IsAny<CancellationToken>()))
                .Throws(new PleiadesDuplicateDataException("The event is already stored."));
            var stored = MachineEventSamples.StoredShift();
            Repository.SetupViews(stored);
            Repository.Setup(r => r.QueryAsync(It.IsAny<MachineEventFilter>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((stored, stored.Count));

            _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    services.Remove(services.Single(d => d.ServiceType == typeof(IMachineEventRepository)));
                    services.AddSingleton(Repository.Object);
                }).UseEnvironment("Test");
            });
            Client = _factory.CreateClient();
        }

        public Mock<IMachineEventRepository> Repository { get; }

        public HttpClient Client { get; }

        public void Dispose()
        {
            Client.Dispose();
            _factory.Dispose();
        }
    }

    private static MachineEventInputDtoV1 Input(string id) => new()
    {
        MId = Machine,
        CloudEvent = MachineEventSamples.CloudEvent("Notification.AlertRaised", 1, 1, new JsonObject { ["Id"] = "a" }, id: id),
    };

    private async Task<HttpStatusCode> Post(Api api, string path, object body)
    {
        using var content = JsonContent.Create(body, options: Json);
        return (await api.Client.PostAsync(new Uri(path, UriKind.Relative), content, TestContext.CancellationToken)).StatusCode;
    }

    [TestMethod]
    public async Task PostMachineEvent_StoresTheCloudEventAsItCame_OrIsAConflict()
    {
        using var api = new Api();

        Assert.AreEqual(HttpStatusCode.Created, await Post(api, "/machineEvents", Input("new")));
        api.Repository.Verify(r => r.CreateAsync(
            It.Is<MachineEventDao>(d => d.Key == $"{MachineEventSamples.Source} new" && d.MId == Machine && d.Type == "Notification.AlertRaised"
                && d.Event["specversion"].AsString == "1.0"),
            It.IsAny<CancellationToken>()), Times.Once);

        Assert.AreEqual(HttpStatusCode.Conflict, await Post(api, "/machineEvents", Input("stored-before")));
    }

    [TestMethod]
    public async Task PostMachineEvent_ThatIsNoCloudEvent_IsABadRequest()
    {
        using var api = new Api();
        using var document = JsonDocument.Parse("""{ "type": "Notification.AlertRaised" }""");

        Assert.AreEqual(HttpStatusCode.BadRequest,
            await Post(api, "/machineEvents", new MachineEventInputDtoV1 { MId = Machine, CloudEvent = document.RootElement.Clone() }));
        api.Repository.Verify(r => r.CreateAsync(It.IsAny<MachineEventDao>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [TestMethod]
    public async Task BulkPostMachineEvents_StoresThemAll()
    {
        using var api = new Api();

        Assert.AreEqual(HttpStatusCode.Created, await Post(api, "/machineEvents/bulk", new[] { Input("a"), Input("b") }));
        api.Repository.Verify(r => r.CreateManyAsync(It.Is<IEnumerable<MachineEventDao>>(e => e.Count() == 2), It.IsAny<CancellationToken>()), Times.Once);
    }

    [TestMethod]
    public async Task GetMachineEvents_PassesTheFilterOn_AndGivesTheDataAsItCame()
    {
        using var api = new Api();

        var page = await api.Client.GetFromJsonAsync<PagedResponse<MachineEventDtoV1>>(
            new Uri($"/machineEvents?mId={Machine}&group=Notification&type=Notification.AlertRaised&take=5", UriKind.Relative), Json, TestContext.CancellationToken);

        Assert.AreEqual(14, page!.TotalCount);
        Assert.AreEqual("4711/01", page.Items[0].Data.GetProperty("JobOrderID").GetString());
        api.Repository.Verify(r => r.QueryAsync(
            It.Is<MachineEventFilter>(f => f.MId == Machine && f.Group == "Notification" && f.Type == "Notification.AlertRaised"),
            0, 5, Sorting.Descending, It.IsAny<CancellationToken>()), Times.Once);
    }

    [TestMethod]
    public async Task GetMachineEvents_FiltersByJobOrder()
    {
        using var api = new Api();

        using var response = await api.Client.GetAsync(
            new Uri("/machineEvents?jobOrderId=4711%2F01", UriKind.Relative), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        api.Repository.Verify(r => r.QueryAsync(
            It.Is<MachineEventFilter>(f => f.JobOrderId == "4711/01" && f.MId == null),
            It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [TestMethod]
    public async Task McpTool_MachineEvents_FiltersByJobOrder()
    {
        var repository = new Mock<IMachineEventRepository>();
        repository.Setup(r => r.QueryAsync(It.IsAny<MachineEventFilter>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(([], 0));

        await new McpTools.MachineEventTools(repository.Object, Microsoft.Extensions.Options.Options.Create(new Services.MongoDbSettings
        {
            ConnectionString = "mongodb://localhost:27017",
            DatabaseName = "Events",
        }), TimeProvider.System).QueryMachineEvents(jobOrderId: "4711/01", cancellationToken: TestContext.CancellationToken);

        repository.Verify(r => r.QueryAsync(
            It.Is<MachineEventFilter>(f => f.JobOrderId == "4711/01"),
            It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [TestMethod]
    public async Task Alerts_ActivePairsAndStatistics()
    {
        using var api = new Api();

        var active = await api.Client.GetFromJsonAsync<PagedResponse<AlertDtoV1>>(
            new Uri($"/alerts/active?mId={Machine}", UriKind.Relative), Json, TestContext.CancellationToken);
        var failures = await api.Client.GetFromJsonAsync<PagedResponse<AlertPairDtoV1>>(
            new Uri($"/alerts/pairs?mId={Machine}&severity=Failure", UriKind.Relative), Json, TestContext.CancellationToken);
        var statistics = await api.Client.GetFromJsonAsync<List<AlertStatisticDtoV1>>(
            new Uri($"/alerts/statistics?mId={Machine}", UriKind.Relative), Json, TestContext.CancellationToken);

        Assert.AreEqual("a-2", active!.Items.Single().AlertId);
        Assert.AreEqual(60, failures!.Items.Single().DurationSeconds);
        Assert.HasCount(2, statistics!);
    }

    [TestMethod]
    public async Task JobOrders_TheLastStateWithItsResult_AndTheHistoryOfOne_Or404()
    {
        using var api = new Api();

        var ended = await api.Client.GetFromJsonAsync<PagedResponse<JobOrderDtoV1>>(
            new Uri($"/jobOrders?mId={Machine}&state=Ended", UriKind.Relative), Json, TestContext.CancellationToken);
        var history = await api.Client.GetFromJsonAsync<JobOrderHistoryDtoV1>(
            new Uri($"/jobOrders/{Machine}/4711/01", UriKind.Relative), Json, TestContext.CancellationToken);
        var unknown = await api.Client.GetAsync(new Uri($"/jobOrders/{Machine}/9999/01", UriKind.Relative), TestContext.CancellationToken);

        Assert.AreEqual("Successful", ended!.Items.Single().JobResult);
        Assert.HasCount(6, history!.History);
        Assert.HasCount(1, history.ProgramExecutions);
        Assert.AreEqual(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [TestMethod]
    public async Task ProgramExecutions_AndGaps()
    {
        using var api = new Api();

        var executions = await api.Client.GetFromJsonAsync<PagedResponse<ProgramExecutionDtoV1>>(
            new Uri($"/programExecutions?mId={Machine}&workMasterId=WM-SHAFT-4711", UriKind.Relative), Json, TestContext.CancellationToken);
        var gaps = await api.Client.GetFromJsonAsync<List<SequenceGapDtoV1>>(
            new Uri($"/machineEvents/gaps?mId={Machine}", UriKind.Relative), Json, TestContext.CancellationToken);

        Assert.AreEqual(240, executions!.Items.Single().Duration);
        Assert.IsEmpty(gaps!, "the shift misses no event");
    }

    [TestMethod]
    [DataRow("/alerts/pairs")]
    [DataRow("/alerts/statistics")]
    [DataRow("/jobOrders")]
    [DataRow("/programExecutions")]
    public async Task AViewThatLeftOlderEventsOut_SaysSo(string path)
    {
        using var api = new Api();
        using (var whole = await api.Client.GetAsync(new Uri(path, UriKind.Relative), TestContext.CancellationToken))
        {
            Assert.IsFalse(whole.Headers.Contains("Pleiades-Truncated"), "a view that read every event says nothing");
        }
        api.Repository.Setup(r => r.FindForViewAsync(It.IsAny<MachineEventFilter>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ViewEvents([], Truncated: true));

        using var response = await api.Client.GetAsync(new Uri(path, UriKind.Relative), TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("true", response.Headers.GetValues("Pleiades-Truncated").Single());
    }
}
