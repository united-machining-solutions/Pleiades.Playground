// SPDX-License-Identifier: Apache-2.0
using System.Net;
using System.Text;
using System.Text.Json;
using Pleiades.Playground.Events.Api.Client.Exceptions;
using Pleiades.Playground.Events.Api.Client.MachineEvents;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Client.Test;

/// <summary>The client posts a CloudEvent with its machine id to <c>/machineEvents</c> and reads what was stored.</summary>
[TestClass]
public sealed class MachineEventApiServiceTest
{
    private sealed class Handler(HttpStatusCode status, string answer) : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }

        public string? Body { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Request = request;
            Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            return new HttpResponseMessage(status) { Content = new StringContent(answer, Encoding.UTF8, "application/json") };
        }
    }

    private static MachineEventInputDtoV1 Input()
    {
        using var document = JsonDocument.Parse("""{ "specversion": "1.0", "id": "e-1", "source": "s", "type": "Notification.AlertRaised", "time": "2026-11-17T09:00:00Z", "data": { "Id": "a" } }""");
        return new MachineEventInputDtoV1 { MId = "alcyone-machines_AX-400_P-04", CloudEvent = document.RootElement.Clone() };
    }

    [TestMethod]
    public async Task PostEvent_SendsTheCloudEventAndTheMachineId_ToMachineEvents()
    {
        using var handler = new Handler(HttpStatusCode.Created, """{ "mId": "alcyone-machines_AX-400_P-04", "group": "Notification", "type": "Notification.AlertRaised", "id": "e-1", "source": "s" }""");
        using var http = new HttpClient(handler) { BaseAddress = new Uri("http://events-api/") };

        var stored = await new MachineEventApiService(http).PostEvent(Input());

        Assert.AreEqual(HttpMethod.Post, handler.Request!.Method);
        Assert.AreEqual("/machineEvents", handler.Request.RequestUri!.AbsolutePath);
        using var body = JsonDocument.Parse(handler.Body!);
        var properties = body.RootElement.EnumerateObject().ToDictionary(p => p.Name, p => p.Value, StringComparer.OrdinalIgnoreCase);
        Assert.AreEqual("alcyone-machines_AX-400_P-04", properties["mId"].GetString());
        Assert.AreEqual("e-1", properties["cloudEvent"].GetProperty("id").GetString(), "the CloudEvent as it came");
        Assert.AreEqual("e-1", stored.Id);
    }

    [TestMethod]
    public async Task PostEvent_StoredBefore_IsAPersistenceException()
    {
        using var handler = new Handler(HttpStatusCode.Conflict, "\"The event is already stored.\"");
        using var http = new HttpClient(handler) { BaseAddress = new Uri("http://events-api/") };

        var error = await Assert.ThrowsExactlyAsync<PleiadesEventPersistenceException>(() => new MachineEventApiService(http).PostEvent(Input()));
        Assert.AreEqual(HttpStatusCode.Conflict, error.StatusCode, "the caller can tell a duplicate from a failure");
    }
}
