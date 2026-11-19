using System.Net;
using System.Net.Http.Json;
using Pleiades.Playground.Sites.Api.DataTransferObjects;

namespace Pleiades.Playground.Sites.Api.Test;

[TestClass]
public sealed class PlacementPositionTests : ApiTestBase
{
    [TestMethod]
    public async Task PutPosition_OfAMachineInAHall_ReturnsThePlacementWithIt_AndGetListsIt()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");

        using var response = await PutPositionAsync("M-05", new PositionRequestV1(12.5, 4));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        var answered = await response.Content.ReadFromJsonAsync<PlacementDtoV1>(Json, Ct);
        var listed = (await GetPlacementsAsync()).Single();
        Assert.AreEqual(answered, listed);
        Assert.AreEqual(new PlacementDtoV1("M-05", "north-plant", "Hall 1", null, Start.UtcDateTime, new PositionDtoV1(12.5, 4)), listed);
    }

    [TestMethod]
    public async Task GetPlacements_OfAMachineWithoutPosition_ListsNull()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");

        Assert.IsNull((await GetPlacementsAsync()).Single().Position);
    }

    [TestMethod]
    public async Task PutPosition_OfAMachineOnNoSite_ReturnsNotFound()
    {
        using var response = await PutPositionAsync("M-05", new PositionRequestV1(1, 1));

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
    }

    [TestMethod]
    public async Task PutPosition_OfAMachineInNoHall_ReturnsBadRequest()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        await GivenPlacementAsync("M-05", "north-plant");

        using var response = await PutPositionAsync("M-05", new PositionRequestV1(1, 1));

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.IsNull((await GetPlacementsAsync()).Single().Position);
    }

    [TestMethod]
    [DataRow(null, 1d)]
    [DataRow(1d, null)]
    [DataRow(-0.1, 1d)]
    [DataRow(1d, 1000.1)]
    public async Task PutPosition_OffThePlanOrIncomplete_ReturnsBadRequest(double? x, double? y)
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");

        using var response = await PutPositionAsync("M-05", new PositionRequestV1(x, y));

        Assert.AreEqual(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [TestMethod]
    public async Task PutPlacement_InTheSameHall_KeepsThePosition()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");
        await GivenPositionAsync("M-05", 3, 7);

        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1("north-plant", "Hall 1", "Grinder five"));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        var listed = (await GetPlacementsAsync()).Single();
        Assert.AreEqual("Grinder five", listed.DisplayName);
        Assert.AreEqual(new PositionDtoV1(3, 7), listed.Position);
    }

    [TestMethod]
    public async Task PutPlacement_ToAnotherHall_DropsThePosition()
    {
        await GivenSiteAsync("north-plant", "Hall 1", "Hall 2");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");
        await GivenPositionAsync("M-05", 3, 7);

        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1("north-plant", "Hall 2", null));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.IsNull((await GetPlacementsAsync()).Single().Position);
    }

    [TestMethod]
    public async Task PutPlacement_ToAnotherSiteWithAHallOfTheSameName_DropsThePosition()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        await GivenSiteAsync("south-plant", "Hall 1");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");
        await GivenPositionAsync("M-05", 3, 7);

        using var response = await PutPlacementAsync("M-05", new PlacementRequestV1("south-plant", "Hall 1", null));

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.IsNull((await GetPlacementsAsync()).Single().Position);
    }

    [TestMethod]
    public async Task DeletePosition_TakesItAway_AndLeavesTheMachineInItsHall()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");
        await GivenPositionAsync("M-05", 3, 7);

        using var response = await DeletePositionAsync("M-05");

        Assert.AreEqual(HttpStatusCode.NoContent, response.StatusCode);
        var listed = (await GetPlacementsAsync()).Single();
        Assert.AreEqual("Hall 1", listed.Hall);
        Assert.IsNull(listed.Position);
    }

    [TestMethod]
    public async Task DeletePosition_OfAMachineWithoutOne_ReturnsNoContent()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        await GivenPlacementAsync("M-05", "north-plant", "Hall 1");

        using var response = await DeletePositionAsync("M-05");

        Assert.AreEqual(HttpStatusCode.NoContent, response.StatusCode);
    }

    [TestMethod]
    public async Task DeletePosition_OfAMachineOnNoSite_ReturnsNotFound()
    {
        using var response = await DeletePositionAsync("M-05");

        Assert.AreEqual(HttpStatusCode.NotFound, response.StatusCode);
    }

    private Task<HttpResponseMessage> PutPositionAsync(string machineId, PositionRequestV1 position) =>
        Http.PutAsJsonAsync(new Uri($"/placements/{machineId}/position", UriKind.Relative), position, Json, Ct);

    private Task<HttpResponseMessage> DeletePositionAsync(string machineId) =>
        Http.DeleteAsync(new Uri($"/placements/{machineId}/position", UriKind.Relative), Ct);

    private async Task GivenPositionAsync(string machineId, double x, double y)
    {
        using var response = await PutPositionAsync(machineId, new PositionRequestV1(x, y));
        response.EnsureSuccessStatusCode();
    }
}
