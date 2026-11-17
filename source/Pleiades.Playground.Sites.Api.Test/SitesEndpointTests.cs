using System.Net;
using System.Net.Http.Json;
using Pleiades.Playground.Sites.Api.DataTransferObjects;

namespace Pleiades.Playground.Sites.Api.Test;

[TestClass]
public sealed class SitesEndpointTests : ApiTestBase
{
    [TestMethod]
    public async Task GetSites_WithoutSites_ReturnsAnEmptyList() =>
        Assert.IsEmpty(await GetSitesAsync());

    [TestMethod]
    public async Task PutSite_New_ReturnsCreatedWithTheSite_AndGetListsIt()
    {
        using var response = await PutSiteAsync("north-plant", new SiteRequestV1("Demo Manufacturing", "North plant", ["Hall 1", "Hall 2"]));

        Assert.AreEqual(HttpStatusCode.Created, response.StatusCode);
        Assert.AreEqual("/sites/north-plant", response.Headers.Location?.OriginalString);
        var created = await response.Content.ReadFromJsonAsync<SiteDtoV1>(Json, Ct);
        Assert.AreEqual("north-plant", created!.SiteId);

        var site = (await GetSitesAsync()).Single();
        Assert.AreEqual("north-plant", site.SiteId);
        Assert.AreEqual("Demo Manufacturing", site.Company);
        Assert.AreEqual("North plant", site.Name);
        Assert.AreEqual("Hall 1, Hall 2", string.Join(", ", site.Halls));
    }

    [TestMethod]
    public async Task PutSite_Existing_ReturnsOk_AndReplacesIt()
    {
        await GivenSiteAsync("north-plant", "Hall 1");

        using var response = await PutSiteAsync("north-plant", new SiteRequestV1("Demo Manufacturing", "North plant, renamed", ["Hall 1", "Hall 3"]));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        var site = (await GetSitesAsync()).Single();
        Assert.AreEqual("North plant, renamed", site.Name);
        Assert.AreEqual("Hall 1, Hall 3", string.Join(", ", site.Halls));
    }

    [TestMethod]
    public async Task GetSites_ListsThemBySiteId()
    {
        await GivenSiteAsync("south-plant");
        await GivenSiteAsync("north-plant");

        Assert.AreEqual("north-plant, south-plant", string.Join(", ", (await GetSitesAsync()).Select(s => s.SiteId)));
    }

    [TestMethod]
    [DataRow("north+plant")]
    [DataRow("north%23plant")]
    [DataRow("north%2Fplant")]
    [DataRow("%20north-plant")]
    [DataRow("north-plant%20")]
    public async Task PutSite_WithAnIdThatIsNoLevelOfATopic_ReturnsBadRequest(string escapedSiteId)
    {
        using var response = await PutSiteAsync(escapedSiteId, new SiteRequestV1("Demo Manufacturing", "North plant", []));

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.IsEmpty(await GetSitesAsync());
    }

    [TestMethod]
    public async Task PutSite_WithoutCompany_ReturnsBadRequestThatSaysSo()
    {
        using var response = await PutSiteAsync("north-plant", new SiteRequestV1(null, "North plant", []));

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("company", await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task PutSite_LeavingOutAHallWithMachines_ReturnsConflict_AndKeepsTheHall()
    {
        await GivenSiteAsync("north-plant", "Hall 1", "Hall 2");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 2");

        using var response = await PutSiteAsync("north-plant", new SiteRequestV1("Demo Manufacturing", "North plant", ["Hall 1"]));

        Assert.AreEqual(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Contains("M-05", await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);
        Assert.AreEqual("Hall 1, Hall 2", string.Join(", ", (await GetSitesAsync()).Single().Halls));
    }

    [TestMethod]
    public async Task PutSite_LeavingOutAHallWithoutMachines_ReturnsOk()
    {
        await GivenSiteAsync("north-plant", "Hall 1", "Hall 2");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");

        using var response = await PutSiteAsync("north-plant", new SiteRequestV1("Demo Manufacturing", "North plant", ["Hall 1"]));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
    }

    [TestMethod]
    public async Task DeleteSite_WithoutMachines_ReturnsNoContent_ThenNotFound()
    {
        await GivenSiteAsync("north-plant");

        using var first = await Http.DeleteAsync(new Uri("/sites/north-plant", UriKind.Relative), Ct);
        using var second = await Http.DeleteAsync(new Uri("/sites/north-plant", UriKind.Relative), Ct);

        Assert.AreEqual(HttpStatusCode.NoContent, first.StatusCode);
        Assert.AreEqual(HttpStatusCode.NotFound, second.StatusCode);
        Assert.IsEmpty(await GetSitesAsync());
    }

    [TestMethod]
    public async Task DeleteSite_WithMachines_ReturnsConflict_AndKeepsTheSite()
    {
        await GivenSiteAsync("north-plant");
        await GivenPlacementAsync("M-05", "north-plant");
        await GivenPlacementAsync("M-06", "north-plant");

        using var response = await Http.DeleteAsync(new Uri("/sites/north-plant", UriKind.Relative), Ct);

        Assert.AreEqual(HttpStatusCode.Conflict, response.StatusCode);
        var text = await response.Content.ReadAsStringAsync(Ct);
        Assert.Contains("M-05", text, StringComparison.Ordinal);
        Assert.Contains("M-06", text, StringComparison.Ordinal);
        Assert.HasCount(1, await GetSitesAsync());
    }

    [TestMethod]
    public async Task DeleteSite_AfterItsMachinesWereRemoved_ReturnsNoContent()
    {
        await GivenSiteAsync("north-plant");
        await GivenPlacementAsync("M-05", "north-plant");
        using var removed = await Http.DeleteAsync(new Uri("/placements/M-05", UriKind.Relative), Ct);

        using var response = await Http.DeleteAsync(new Uri("/sites/north-plant", UriKind.Relative), Ct);

        Assert.AreEqual(HttpStatusCode.NoContent, response.StatusCode);
    }
}
