using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Pleiades.Playground.Sites.Api.DataTransferObjects;

namespace Pleiades.Playground.Sites.Api.Test;

/// <summary>
/// A fresh host per test, with an empty store and a clock at <see cref="Start"/>.
/// </summary>
public abstract class ApiTestBase
{
    internal static readonly DateTimeOffset Start = new(2026, 11, 18, 8, 12, 0, TimeSpan.Zero);

    internal static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    public required TestContext TestContext { get; set; }

    internal InMemorySitesStore Store { get; private set; } = null!;

    internal FixedTimeProvider Clock { get; private set; } = null!;

    internal HttpClient Http { get; private set; } = null!;

    private WebApplicationFactory<Program> _factory = null!;

    [TestInitialize]
    public void StartHost()
    {
        Store = new InMemorySitesStore();
        Clock = new FixedTimeProvider(Start);
        _factory = SitesApiFactory.Create(Store, Clock);
        Http = _factory.CreateClient();
    }

    [TestCleanup]
    public async Task StopHost()
    {
        Http.Dispose();
        await _factory.DisposeAsync();
        Store.Dispose();
    }

    internal CancellationToken Ct => TestContext.CancellationToken;

    internal Task<HttpResponseMessage> PutSiteAsync(string siteId, SiteRequestV1 site) =>
        Http.PutAsJsonAsync(new Uri($"/sites/{siteId}", UriKind.Relative), site, Json, Ct);

    internal Task<HttpResponseMessage> PutPlacementAsync(string machineId, PlacementRequestV1 placement) =>
        Http.PutAsJsonAsync(new Uri($"/placements/{machineId}", UriKind.Relative), placement, Json, Ct);

    internal async Task<List<SiteDtoV1>> GetSitesAsync() =>
        (await Http.GetFromJsonAsync<List<SiteDtoV1>>(new Uri("/sites", UriKind.Relative), Json, Ct))!;

    internal async Task<List<PlacementDtoV1>> GetPlacementsAsync() =>
        (await Http.GetFromJsonAsync<List<PlacementDtoV1>>(new Uri("/placements", UriKind.Relative), Json, Ct))!;

    internal async Task GivenSiteAsync(string siteId, params string[] halls)
    {
        using var response = await PutSiteAsync(siteId, new SiteRequestV1("Demo Manufacturing", siteId, halls));
        response.EnsureSuccessStatusCode();
    }

    internal async Task GivenPlacementAsync(string machineId, string siteId, string? hall = null)
    {
        using var response = await PutPlacementAsync(machineId, new PlacementRequestV1(siteId, hall, null));
        response.EnsureSuccessStatusCode();
    }
}
