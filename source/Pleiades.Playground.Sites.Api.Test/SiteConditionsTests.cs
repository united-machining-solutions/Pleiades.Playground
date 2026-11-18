using System.Net;
using System.Net.Http.Json;
using Pleiades.Playground.Sites.Api.DataTransferObjects;

namespace Pleiades.Playground.Sites.Api.Test;

/// <summary>
/// The conditions of a write on a site: <c>If-None-Match: *</c> makes a site only where there is none,
/// <c>If-Match</c> changes or removes only the site with that entity tag, 412 otherwise. Without them a write is
/// as it was.
/// </summary>
[TestClass]
public sealed class SiteConditionsTests : ApiTestBase
{
    private static readonly SiteRequestV1 NorthPlant = new("Demo Manufacturing", "North plant", ["Hall 1"]);

    [TestMethod]
    public async Task GetAndPut_CarryTheSameEntityTag_WhichChangesWithTheSite()
    {
        using var created = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant);
        var tag = created.Headers.ETag?.Tag;

        Assert.IsNotNull(tag);
        Assert.AreEqual(tag, (await created.Content.ReadFromJsonAsync<SiteDtoV1>(Json, Ct))!.Etag);
        Assert.AreEqual(tag, (await GetSitesAsync()).Single().Etag);

        using var changed = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant with { Halls = ["Hall 1", "Hall 2"] });
        Assert.AreNotEqual(tag, changed.Headers.ETag?.Tag);
        Assert.AreEqual(changed.Headers.ETag?.Tag, (await GetSitesAsync()).Single().Etag);
    }

    [TestMethod]
    public async Task PutSite_IfNoneMatchStar_MakesANewSite()
    {
        using var response = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant, ifNoneMatch: "*");

        Assert.AreEqual(HttpStatusCode.Created, response.StatusCode);
    }

    [TestMethod]
    public async Task PutSite_IfNoneMatchStar_OnASiteThatExists_ReturnsPreconditionFailed_AndChangesNothing()
    {
        await GivenSiteAsync("north-plant", "Hall 1", "Hall 2");

        using var response = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant with { Company = "Other" }, ifNoneMatch: "*");

        Assert.AreEqual(HttpStatusCode.PreconditionFailed, response.StatusCode);
        Assert.Contains("exists already", await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);
        var site = (await GetSitesAsync()).Single();
        Assert.AreEqual("Demo Manufacturing", site.Company);
        Assert.AreEqual("Hall 1, Hall 2", string.Join(", ", site.Halls));
    }

    [TestMethod]
    public async Task PutSite_IfMatchTheTagThatWasRead_ChangesTheSite()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        var tag = (await GetSitesAsync()).Single().Etag;

        using var response = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant with { Halls = ["Hall 1", "Hall 2"] }, ifMatch: tag);

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
        Assert.AreEqual("Hall 1, Hall 2", string.Join(", ", (await GetSitesAsync()).Single().Halls));
    }

    [TestMethod]
    public async Task PutSite_IfMatchAnOldTag_ReturnsPreconditionFailed_AndKeepsTheChangeOfTheOther()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        var read = (await GetSitesAsync()).Single().Etag;
        using var renamed = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant with { Name = "North plant, renamed" }, ifMatch: read);

        using var response = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant with { Halls = ["Hall 1", "Hall 2"] }, ifMatch: read);

        Assert.AreEqual(HttpStatusCode.PreconditionFailed, response.StatusCode);
        Assert.Contains("was changed since it was read", await response.Content.ReadAsStringAsync(Ct), StringComparison.Ordinal);
        var site = (await GetSitesAsync()).Single();
        Assert.AreEqual("North plant, renamed", site.Name);
        Assert.AreEqual("Hall 1", string.Join(", ", site.Halls));
    }

    [TestMethod]
    public async Task PutSite_IfMatch_OnASiteThatIsNotThere_ReturnsPreconditionFailed_AndMakesNone()
    {
        using var response = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant, ifMatch: "\"0000000000000000\"");

        Assert.AreEqual(HttpStatusCode.PreconditionFailed, response.StatusCode);
        Assert.IsEmpty(await GetSitesAsync());
    }

    [TestMethod]
    public async Task PutSite_IfMatchStar_ChangesASiteThatExists()
    {
        await GivenSiteAsync("north-plant", "Hall 1");

        using var response = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant with { Name = "Renamed" }, ifMatch: "*");

        Assert.AreEqual(HttpStatusCode.OK, response.StatusCode);
    }

    [TestMethod]
    public async Task DeleteSite_IfMatchAnOldTag_ReturnsPreconditionFailed_AndKeepsTheSite()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        var read = (await GetSitesAsync()).Single().Etag;
        using var changed = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant with { Halls = ["Hall 1", "Hall 2"] });

        using var response = await SendAsync(HttpMethod.Delete, "/sites/north-plant", null, ifMatch: read);

        Assert.AreEqual(HttpStatusCode.PreconditionFailed, response.StatusCode);
        Assert.HasCount(1, await GetSitesAsync());
    }

    [TestMethod]
    public async Task DeleteSite_IfMatchTheTagThatWasRead_RemovesIt()
    {
        await GivenSiteAsync("north-plant", "Hall 1");
        var tag = (await GetSitesAsync()).Single().Etag;

        using var response = await SendAsync(HttpMethod.Delete, "/sites/north-plant", null, ifMatch: tag);

        Assert.AreEqual(HttpStatusCode.NoContent, response.StatusCode);
        Assert.IsEmpty(await GetSitesAsync());
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, SiteRequestV1? site, string? ifMatch = null, string? ifNoneMatch = null)
    {
        using var request = new HttpRequestMessage(method, new Uri(path, UriKind.Relative));
        if (site is not null)
        {
            request.Content = JsonContent.Create(site, options: Json);
        }

        if (ifMatch is not null)
        {
            request.Headers.TryAddWithoutValidation("If-Match", ifMatch);
        }

        if (ifNoneMatch is not null)
        {
            request.Headers.TryAddWithoutValidation("If-None-Match", ifNoneMatch);
        }

        return await Http.SendAsync(request, Ct);
    }
}
