using System.Net;
using System.Net.Http.Json;
using Pleiades.Playground.Sites.Api.DataTransferObjects;

namespace Pleiades.Playground.Sites.Api.Test;

[TestClass]
public sealed class PlacementsEndpointTests : ApiTestBase
{
    [TestMethod]
    public async Task GetPlacements_WithoutPlacements_ReturnsAnEmptyList() =>
        Assert.IsEmpty(await GetPlacementsAsync());

    [TestMethod]
    public async Task PutPlacement_New_ReturnsCreated_AndGetListsItWithTheTimeItWasPlaced()
    {
        await GivenSiteAsync("north-plant", "Hall 1", "Hall 2");

        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1("north-plant", "Hall 2", "Grinder five"));

        Assert.AreEqual(HttpStatusCode.Created, response.StatusCode);
        Assert.AreEqual("/placements/M-05", response.Headers.Location?.OriginalString);
        var created = await response.Content.ReadFromJsonAsync<PlacementDtoV1>(Json, Ct);
        var listed = (await GetPlacementsAsync()).Single();
        Assert.AreEqual(created, listed);
        Assert.AreEqual(new PlacementDtoV1("M-05", "north-plant", "Hall 2", "Grinder five", Start.UtcDateTime), listed);
    }

    [TestMethod]
    public async Task PutPlacement_OnlyTheSite_LeavesHallAndDisplayNameNull()
    {
        await GivenSiteAsync("north-plant", "Hall 1");

        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1("north-plant", null, null));

        Assert.AreEqual(HttpStatusCode.Created, response.StatusCode);
        var listed = (await GetPlacementsAsync()).Single();
        Assert.IsNull(listed.Hall);
        Assert.IsNull(listed.DisplayName);
    }

    [TestMethod]
    public async Task PutPlacement_SameMachineTwice_ReturnsOk_AndKeepsOnePlacementWithItsFirstTime()
    {
        await GivenSiteAsync("north-plant", "Hall 1", "Hall 2");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");
        Clock.Now = Start.AddHours(1);

        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1("north-plant", "Hall 2", null));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        var listed = (await GetPlacementsAsync()).Single();
        Assert.AreEqual("Hall 2", listed.Hall);
        Assert.AreEqual(Start.UtcDateTime, listed.PlacedAt);
    }

    [TestMethod]
    public async Task PutPlacement_ToAnotherSite_MovesTheMachine_AndSetsTheTimeItWasPlaced()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        await GivenSiteAsync("south-plant", "Hall A");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");
        Clock.Now = Start.AddDays(2);

        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1("south-plant", "Hall A", null));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        var listed = (await GetPlacementsAsync()).Single();
        Assert.AreEqual(new PlacementDtoV1("M-05", "south-plant", "Hall A", null, Start.AddDays(2).UtcDateTime), listed);
    }

    [TestMethod]
    public async Task GetPlacements_ListsThemBySerialNumber()
    {
        await GivenSiteAsync("north-plant");
        await GivenPlacementAsync("P-07", "north-plant");
        await GivenPlacementAsync("M-02", "north-plant");

        Assert.AreEqual("M-02, P-07", string.Join(", ", (await GetPlacementsAsync()).Select(p => p.SerialNumber)));
    }

    [TestMethod]
    public async Task PutPlacement_OnASiteThatDoesNotExist_ReturnsBadRequest()
    {
        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1("north-plant", null, null));

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("no site 'north-plant'", await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);
        Assert.IsEmpty(await GetPlacementsAsync());
    }

    [TestMethod]
    public async Task PutPlacement_InAHallTheSiteDoesNotHave_ReturnsBadRequest()
    {
        await GivenSiteAsync("north-plant", "Hall 1");

        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1("north-plant", "Hall 9", null));

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.IsEmpty(await GetPlacementsAsync());
    }

    [TestMethod]
    [DataRow("M+05")]
    [DataRow("M%2305")]
    [DataRow("M%2F05")]
    [DataRow("%20M-05")]
    public async Task PutPlacement_WithASerialNumberThatIsNoLevelOfATopic_ReturnsBadRequest(string escapedSerialNumber)
    {
        await GivenSiteAsync("north-plant");

        using var response = await PutPlacementAsync(escapedSerialNumber, new PlacementRequestV1("north-plant", null, null));

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.IsEmpty(await GetPlacementsAsync());
    }

    [TestMethod]
    [DataRow("north/plant")]
    [DataRow("north+plant")]
    [DataRow("north#plant")]
    public async Task PutPlacement_WithASiteIdThatIsNoLevelOfATopic_ReturnsBadRequest(string siteId)
    {
        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1(siteId, null, null));

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("MQTT topic", await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task DeletePlacement_ReturnsNoContent_ThenNotFound_AndTheSiteStays()
    {
        await GivenSiteAsync("north-plant");
        await GivenPlacementAsync("M-05", "north-plant");

        using var first = await Http.DeleteAsync(new Uri("/placements/M-05", UriKind.Relative), Ct);
        using var second = await Http.DeleteAsync(new Uri("/placements/M-05", UriKind.Relative), Ct);

        Assert.AreEqual(HttpStatusCode.NoContent, first.StatusCode);
        Assert.AreEqual(HttpStatusCode.NotFound, second.StatusCode);
        Assert.IsEmpty(await GetPlacementsAsync());
        Assert.HasCount(1, await GetSitesAsync());
    }
}
