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
using Pleiades.Playground.Events.Api.Repositories.JobEvent;
using Pleiades.Playground.Events.Api.Repositories.WorkMasterEvent;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test.IntegrationTests;

/// <summary>
/// The endpoints of job events, job orders and work master events, with the repositories mocked: what goes to
/// them, and what the views make of what they return.
/// </summary>
[TestClass]
public sealed class ApiJobAndWorkMasterEventTest
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
            Jobs = new Mock<IJobEventRepository>();
            Jobs.Setup(r => r.CreateAsync(It.Is<JobEventDao>(e => e.Id == ExistingId), It.IsAny<CancellationToken>()))
                .Throws(new PleiadesDuplicateDataException("exists"));
            Jobs.Setup(r => r.CreateManyAsync(It.Is<IEnumerable<JobEventDao>>(events => events.Any(e => e.Id == ExistingId)), It.IsAny<CancellationToken>()))
                .Throws(new PleiadesDuplicateDataException("Some job events already exist."));
            var jobs = JobEventSamples.OneJobOrder("P-04");
            Jobs.Setup(r => r.FindForViewAsync(It.IsAny<JobEventFilter>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((JobEventFilter f, CancellationToken _) => [.. jobs.Where(e => f.JobOrderId is null || e.JobOrderId == f.JobOrderId)]);
            Jobs.Setup(r => r.QueryEventsWithPaginationAsync(It.IsAny<JobEventFilter>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((jobs, jobs.Count));

            WorkMasters = new Mock<IWorkMasterEventRepository>();
            WorkMasters.Setup(r => r.CreateAsync(It.Is<WorkMasterEventDao>(e => e.Id == ExistingId), It.IsAny<CancellationToken>()))
                .Throws(new PleiadesDuplicateDataException("exists"));
            var executions = JobEventSamples.OneExecution("P-04");
            WorkMasters.Setup(r => r.FindForViewAsync(It.IsAny<WorkMasterEventFilter>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((WorkMasterEventFilter f, CancellationToken _) => [.. executions.Where(e => f.JobOrderId is null || e.JobOrderId == f.JobOrderId)]);
            WorkMasters.Setup(r => r.QueryEventsWithPaginationAsync(It.IsAny<WorkMasterEventFilter>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<Sorting>(), It.IsAny<CancellationToken>()))
                .ReturnsAsync((executions, executions.Count));

            _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
            {
                builder.ConfigureServices(services =>
                {
                    services.Remove(services.Single(d => d.ServiceType == typeof(IJobEventRepository)));
                    services.Remove(services.Single(d => d.ServiceType == typeof(IWorkMasterEventRepository)));
                    services.AddSingleton(Jobs.Object);
                    services.AddSingleton(WorkMasters.Object);
                }).UseEnvironment("Test");
            });
            Client = _factory.CreateClient();
        }

        public Mock<IJobEventRepository> Jobs { get; }

        public Mock<IWorkMasterEventRepository> WorkMasters { get; }

        public HttpClient Client { get; }

        public void Dispose()
        {
            Client.Dispose();
            _factory.Dispose();
        }
    }

    private static JobEventDtoV1 JobEvent(string id) => new()
    {
        Id = id,
        MId = "P-04",
        Timestamp = JobEventSamples.Start,
        Action = JobAction.ResultChanged,
        CorrelationId = "4711/01",
        JobOrderId = "4711/01",
        State = "Running",
        StartTime = JobEventSamples.Start,
        ProducedQuantity = 3,
        JobResult = "Unknown",
    };

    private static WorkMasterEventDtoV1 WorkMasterEvent(string id) => new()
    {
        Id = id,
        MId = "P-04",
        Timestamp = JobEventSamples.Start,
        Action = WorkMasterAction.Ended,
        CorrelationId = "exec-1",
        ExecutionId = "exec-1",
        State = "Ended",
        StartTime = JobEventSamples.Start,
        EnergyElectricity = 720_000,
    };

    [TestMethod]
    public async Task PostJobEvent_NewEvent_IsCreated_AsItCame_OrAConflict()
    {
        using var api = new Api();

        using var created = JsonContent.Create(JobEvent("P-04:new:1"), options: Json);
        Assert.AreEqual(HttpStatusCode.Created,
            (await api.Client.PostAsync(new Uri("/jobEvents", UriKind.Relative), created, TestContext.CancellationToken)).StatusCode);
        api.Jobs.Verify(r => r.CreateAsync(
            It.Is<JobEventDao>(d => d.Id == "P-04:new:1" && d.Action == JobAction.ResultChanged && Math.Abs(d.ProducedQuantity!.Value - 3) < 1e-9),
            It.IsAny<CancellationToken>()), Times.Once);

        using var conflict = JsonContent.Create(JobEvent(ExistingId), options: Json);
        Assert.AreEqual(HttpStatusCode.Conflict,
            (await api.Client.PostAsync(new Uri("/jobEvents", UriKind.Relative), conflict, TestContext.CancellationToken)).StatusCode);
    }

    [TestMethod]
    public async Task BulkPostJobEvents_CreatesOrConflicts()
    {
        using var api = new Api();

        using var created = JsonContent.Create(new[] { JobEvent("a"), JobEvent("b") }, options: Json);
        Assert.AreEqual(HttpStatusCode.Created,
            (await api.Client.PostAsync(new Uri("/jobEvents/bulk", UriKind.Relative), created, TestContext.CancellationToken)).StatusCode);

        using var conflict = JsonContent.Create(new[] { JobEvent("c"), JobEvent(ExistingId) }, options: Json);
        Assert.AreEqual(HttpStatusCode.Conflict,
            (await api.Client.PostAsync(new Uri("/jobEvents/bulk", UriKind.Relative), conflict, TestContext.CancellationToken)).StatusCode);
    }

    [TestMethod]
    public async Task PostWorkMasterEvent_NewEvent_IsCreated_OrAConflict()
    {
        using var api = new Api();

        using var created = JsonContent.Create(WorkMasterEvent("P-04:new:1"), options: Json);
        Assert.AreEqual(HttpStatusCode.Created,
            (await api.Client.PostAsync(new Uri("/workMasterEvents", UriKind.Relative), created, TestContext.CancellationToken)).StatusCode);
        api.WorkMasters.Verify(r => r.CreateAsync(
            It.Is<WorkMasterEventDao>(d => d.Id == "P-04:new:1" && d.Action == WorkMasterAction.Ended && Math.Abs(d.EnergyElectricity!.Value - 720_000) < 1e-6),
            It.IsAny<CancellationToken>()), Times.Once);

        using var conflict = JsonContent.Create(WorkMasterEvent(ExistingId), options: Json);
        Assert.AreEqual(HttpStatusCode.Conflict,
            (await api.Client.PostAsync(new Uri("/workMasterEvents", UriKind.Relative), conflict, TestContext.CancellationToken)).StatusCode);

        using var bulk = JsonContent.Create(new[] { WorkMasterEvent("a"), WorkMasterEvent("b") }, options: Json);
        Assert.AreEqual(HttpStatusCode.Created,
            (await api.Client.PostAsync(new Uri("/workMasterEvents/bulk", UriKind.Relative), bulk, TestContext.CancellationToken)).StatusCode);
    }

    [TestMethod]
    public async Task GetJobEvents_PassesTheFilterOn()
    {
        using var api = new Api();

        var page = await api.Client.GetFromJsonAsync<PagedResponse<JobEventDtoV1>>(
            new Uri("/jobEvents?mId=P-04&action=ResultChanged&jobOrderId=4711%2F01&take=5", UriKind.Relative), Json, TestContext.CancellationToken);

        Assert.AreEqual(6, page!.TotalCount);
        api.Jobs.Verify(r => r.QueryEventsWithPaginationAsync(
            It.Is<JobEventFilter>(f => f.MId == "P-04" && f.Action == JobAction.ResultChanged && f.JobOrderId == "4711/01"),
            0, 5, Sorting.Descending, It.IsAny<CancellationToken>()), Times.Once);
    }

    [TestMethod]
    public async Task GetWorkMasterEvents_PassesTheFilterOn()
    {
        using var api = new Api();

        var page = await api.Client.GetFromJsonAsync<PagedResponse<WorkMasterEventDtoV1>>(
            new Uri("/workMasterEvents?mId=P-04&action=Ended&workMasterId=WM-SHAFT-4711", UriKind.Relative), Json, TestContext.CancellationToken);

        Assert.AreEqual(4, page!.TotalCount);
        api.WorkMasters.Verify(r => r.QueryEventsWithPaginationAsync(
            It.Is<WorkMasterEventFilter>(f => f.MId == "P-04" && f.Action == WorkMasterAction.Ended && f.WorkMasterId == "WM-SHAFT-4711"),
            0, It.IsAny<int>(), Sorting.Descending, It.IsAny<CancellationToken>()), Times.Once);
    }

    [TestMethod]
    public async Task GetCorrelationPairs_GivesTheProgramExecutions()
    {
        using var api = new Api();

        var page = await api.Client.GetFromJsonAsync<PagedResponse<ProgramExecutionPairDtoV1>>(
            new Uri("/workMasterEvents/correlationPairs?mId=P-04", UriKind.Relative), Json, TestContext.CancellationToken);

        var pair = page!.Items.Single();
        Assert.AreEqual("exec-1", pair.ExecutionId);
        Assert.AreEqual(WorkMasterAction.Ended, pair.EndAction);
        Assert.AreEqual(240, pair.Duration);
    }

    [TestMethod]
    public async Task GetJobOrders_GivesTheLastStateOfEach_WithItsResult_FilteredByState()
    {
        using var api = new Api();

        var ended = await api.Client.GetFromJsonAsync<PagedResponse<JobOrderDtoV1>>(
            new Uri("/jobOrders?mId=P-04&state=Ended", UriKind.Relative), Json, TestContext.CancellationToken);
        var running = await api.Client.GetFromJsonAsync<PagedResponse<JobOrderDtoV1>>(
            new Uri("/jobOrders?mId=P-04&state=Running", UriKind.Relative), Json, TestContext.CancellationToken);

        var jobOrder = ended!.Items.Single();
        Assert.AreEqual("4711/01", jobOrder.JobOrderId);
        Assert.AreEqual(1, jobOrder.ProducedQuantity);
        Assert.AreEqual("Successful", jobOrder.JobResult);
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
        Assert.AreEqual("Successful", history.JobOrder.JobResult);
        Assert.HasCount(6, history.History);
        Assert.HasCount(1, history.ProgramExecutions);
        Assert.AreEqual(HttpStatusCode.NotFound, unknown.StatusCode);
    }
}
