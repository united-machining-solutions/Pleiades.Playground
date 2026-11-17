// SPDX-License-Identifier: Apache-2.0
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Pleiades.Playground.Common.Exceptions;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Repositories.ProductionEvent;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test.IntegrationTests;

/// <summary>
/// The endpoints of production events and job orders, with the repository mocked: what goes to it, and what the
/// views make of what it returns.
/// </summary>
[TestClass]
public sealed class ApiProductionEventTest
{
    private const string ExistingId = "P-04:existing:1";
    private static readonly JsonSerializerOptions Json = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    public required TestContext TestContext { get; set; }

    private sealed class Api : IDisposable
    {
        private readonly WebApplicationFactory<Program> _factory;

        [System.Diagnostics.CodeAnalysis.SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope",
            Justification = "WithWebHostBuilder manages the lifecycle of the parent factory")]
        public Api()
        {
            Repository = new Mock<IProductionEventRepository>();
            Repository.Setup(r => r.CreateAsync(It.Is<ProductionEventDao>(e => e.Id == ExistingId), It.IsAny<CancellationToken>()))
                .Throws(new PleiadesDuplicateDataException("exists"));
            Repository.Setup(r => r.CreateManyAsync(It.Is<IEnumerable<ProductionEventDao>>(events => events.Any(e => e.Id == ExistingId)), It.IsAny<CancellationToken>()))
                .Throws(new PleiadesDuplicateDataException("Some production events already exist."));
            var events = ProductionEventSamples.OneJobOrderWithOneExecution("P-04");
            Repository.Setup(r => r.FindForViewAsync(It.IsAny<ProductionEventFilter>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((ProductionEventFilter f, CancellationToken _) =>
                    [.. events.Where(e => (f.JobOrderId is null || e.JobOrderId == f.JobOrderId) && (f.Subject is null || e.Subject == f.Subject))]);
            Repository.Setup(r => r.QueryEventsWithPaginationAsync(It.IsAny<ProductionEventFilter>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((events, events.Count));

            _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    services.Remove(services.Single(d => d.ServiceType == typeof(IProductionEventRepository)));
                    services.AddSingleton(Repository.Object);
                }).UseEnvironment("Test");
            });
            Client = _factory.CreateClient();
        }

        public Mock<IProductionEventRepository> Repository { get; }

        public HttpClient Client { get; }

        public void Dispose()
        {
            Client.Dispose();
            _factory.Dispose();
        }
    }

    private static ProductionEventDtoV1 Event(string id) => new()
    {
        Id = id,
        MId = "P-04",
        Timestamp = ProductionEventSamples.Start,
        Subject = ProductionSubject.ProgramExecution,
        Action = ProductionAction.Ended,
        CorrelationId = "exec-1",
        ExecutionId = "exec-1",
        State = "Ended",
        EnergyElectricity = 720_000,
    };

    [TestMethod]
    public async Task PostProductionEvent_NewEvent_IsCreated_AsItCame()
    {
        using var api = new Api();

        using var content = JsonContent.Create(Event("P-04:new:1"), options: Json);
        var response = await api.Client.PostAsync(new Uri("/productionEvents", UriKind.Relative), content, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.Created, response.StatusCode);
        api.Repository.Verify(r => r.CreateAsync(
            It.Is<ProductionEventDao>(d => d.Id == "P-04:new:1" && d.Subject == ProductionSubject.ProgramExecution
                && d.Action == ProductionAction.Ended && Math.Abs(d.EnergyElectricity!.Value - 720_000) < 1e-6),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [TestMethod]
    public async Task PostProductionEvent_ARepeatedDelivery_IsAConflict()
    {
        using var api = new Api();

        using var content = JsonContent.Create(Event(ExistingId), options: Json);
        var response = await api.Client.PostAsync(new Uri("/productionEvents", UriKind.Relative), content, TestContext.CancellationToken);

        Assert.AreEqual(HttpStatusCode.Conflict, response.StatusCode);
    }

    [TestMethod]
    public async Task BulkPostProductionEvents_CreatesOrConflicts()
    {
        using var api = new Api();

        using var created = JsonContent.Create(new[] { Event("a"), Event("b") }, options: Json);
        Assert.AreEqual(HttpStatusCode.Created,
            (await api.Client.PostAsync(new Uri("/productionEvents/bulk", UriKind.Relative), created, TestContext.CancellationToken)).StatusCode);

        using var conflict = JsonContent.Create(new[] { Event("c"), Event(ExistingId) }, options: Json);
        Assert.AreEqual(HttpStatusCode.Conflict,
            (await api.Client.PostAsync(new Uri("/productionEvents/bulk", UriKind.Relative), conflict, TestContext.CancellationToken)).StatusCode);
    }

    [TestMethod]
    public async Task GetProductionEvents_PassesTheFilterOn()
    {
        using var api = new Api();

        var page = await api.Client.GetFromJsonAsync<PagedResponse<ProductionEventDtoV1>>(
            new Uri("/productionEvents?mId=P-04&subject=JobOrder&action=Ended&jobOrderId=4711%2F01&take=5", UriKind.Relative), Json, TestContext.CancellationToken);

        Assert.IsNotNull(page);
        Assert.AreEqual(9, page.TotalCount);
        api.Repository.Verify(r => r.QueryEventsWithPaginationAsync(
            It.Is<ProductionEventFilter>(f => f.MId == "P-04" && f.Subject == ProductionSubject.JobOrder && f.Action == ProductionAction.Ended && f.JobOrderId == "4711/01"),
            0, 5, Sorting.Descending, It.IsAny<CancellationToken>()), Times.Once);
    }

    [TestMethod]
    public async Task GetCorrelationPairs_GivesTheProgramExecutions()
    {
        using var api = new Api();

        var page = await api.Client.GetFromJsonAsync<PagedResponse<ProgramExecutionPairDtoV1>>(
            new Uri("/productionEvents/correlationPairs?mId=P-04", UriKind.Relative), Json, TestContext.CancellationToken);

        var pair = page!.Items.Single();
        Assert.AreEqual("exec-1", pair.ExecutionId);
        Assert.AreEqual(ProductionAction.Ended, pair.EndAction);
        Assert.AreEqual(240, pair.Duration);
    }

    [TestMethod]
    public async Task GetJobOrders_GivesTheLastStateOfEach_FilteredByState()
    {
        using var api = new Api();

        var ended = await api.Client.GetFromJsonAsync<PagedResponse<JobOrderDtoV1>>(
            new Uri("/jobOrders?mId=P-04&state=Ended", UriKind.Relative), Json, TestContext.CancellationToken);
        var running = await api.Client.GetFromJsonAsync<PagedResponse<JobOrderDtoV1>>(
            new Uri("/jobOrders?mId=P-04&state=Running", UriKind.Relative), Json, TestContext.CancellationToken);

        var jobOrder = ended!.Items.Single();
        Assert.AreEqual("4711/01", jobOrder.JobOrderId);
        Assert.AreEqual(1, jobOrder.ProducedQuantity);
        Assert.AreEqual(720_000, jobOrder.EnergyElectricity);
        Assert.IsEmpty(running!.Items);
    }

    [TestMethod]
    public async Task GetJobOrder_WithASlashInItsId_GivesItsHistory_Or404()
    {
        using var api = new Api();

        var history = await api.Client.GetFromJsonAsync<JobOrderHistoryDtoV1>(
            new Uri("/jobOrders/P-04/4711/01", UriKind.Relative), Json, TestContext.CancellationToken);
        var unknown = await api.Client.GetAsync(new Uri("/jobOrders/P-04/9999/01", UriKind.Relative), TestContext.CancellationToken);

        Assert.AreEqual("Ended", history!.JobOrder.State);
        Assert.HasCount(9, history.History);
        Assert.AreEqual(HttpStatusCode.NotFound, unknown.StatusCode);
    }
}
