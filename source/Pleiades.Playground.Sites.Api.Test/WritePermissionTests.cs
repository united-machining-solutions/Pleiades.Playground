using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Pleiades.Playground.Common.Authorization;
using Pleiades.Playground.Sites.Api.DataTransferObjects;

namespace Pleiades.Playground.Sites.Api.Test;

/// <summary>
/// With auth on, reading needs <c>sites:read</c> (or <c>sites:write</c>), writing needs <c>sites:write</c> or the
/// internal API key, as for the other APIs.
/// </summary>
[TestClass]
public sealed class WritePermissionTests : IDisposable
{
    private static readonly SiteRequestV1 NorthPlant = new("Demo Manufacturing", "North plant", ["Hall 1"]);

    public required TestContext TestContext { get; set; }

    private InMemorySitesStore _store = null!;
    private WebApplicationFactory<Program> _factory = null!;
    private HttpClient _http = null!;

    private CancellationToken Ct => TestContext.CancellationToken;

    [TestInitialize]
    public void StartHost()
    {
        _store = new InMemorySitesStore();
        _factory = SitesApiFactory.CreateWithAuth(_store, new FixedTimeProvider(ApiTestBase.Start));
        _http = _factory.CreateClient();
    }

    public void Dispose()
    {
        _http.Dispose();
        _factory.Dispose();
        _store.Dispose();
    }

    [TestMethod]
    public async Task PutSite_WithoutCredentials_ReturnsUnauthorized()
    {
        using var response = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant);

        Assert.AreEqual(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.IsEmpty(await _store.ListSitesAsync(Ct));
    }

    [TestMethod]
    [DataRow("PUT", "/sites/north-plant")]
    [DataRow("DELETE", "/sites/north-plant")]
    [DataRow("PUT", "/placements/M-05")]
    [DataRow("DELETE", "/placements/M-05")]
    [DataRow("PUT", "/placements/M-05/position")]
    [DataRow("DELETE", "/placements/M-05/position")]
    public async Task Write_WithReadPermissionOnly_ReturnsForbidden(string method, string path)
    {
        ArgumentException.ThrowIfNullOrEmpty(path);
        object? body = path.StartsWith("/sites", StringComparison.Ordinal) ? NorthPlant : new PlacementRequestV1("north-plant", null, null);

        using var response = await SendAsync(new HttpMethod(method), path, method == "PUT" ? body : null, Token("sites:read"));

        Assert.AreEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [TestMethod]
    public async Task PutSite_WithWritePermission_ReturnsCreated()
    {
        using var response = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant, Token("sites:write"));

        Assert.AreEqual(HttpStatusCode.Created, response.StatusCode);
    }

    [TestMethod]
    public async Task PutSite_WithThePermissionOfAnotherApi_ReturnsForbidden()
    {
        using var response = await SendAsync(HttpMethod.Put, "/sites/north-plant", NorthPlant, Token("events:write"));

        Assert.AreEqual(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [TestMethod]
    public async Task PutSite_WithTheInternalApiKey_ReturnsCreated()
    {
        using var request = new HttpRequestMessage(HttpMethod.Put, new Uri("/sites/north-plant", UriKind.Relative))
        {
            Content = JsonContent.Create(NorthPlant, options: ApiTestBase.Json),
        };
        request.Headers.Add(InternalApiKeyDefaults.HeaderName, SitesApiFactory.InternalApiKey);

        using var response = await _http.SendAsync(request, Ct);

        Assert.AreEqual(HttpStatusCode.Created, response.StatusCode);
    }

    [TestMethod]
    [DataRow("/sites")]
    [DataRow("/placements")]
    public async Task Read_WithReadPermission_ReturnsOk_AndWithoutCredentials_Unauthorized(string path)
    {
        using var withRead = await SendAsync(HttpMethod.Get, path, null, Token("sites:read"));
        using var without = await SendAsync(HttpMethod.Get, path, null);

        Assert.AreEqual(HttpStatusCode.OK, withRead.StatusCode);
        Assert.AreEqual(HttpStatusCode.Unauthorized, without.StatusCode);
    }

    private async Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, object? body, string? token = null)
    {
        using var request = new HttpRequestMessage(method, new Uri(path, UriKind.Relative));
        if (body is not null)
        {
            request.Content = JsonContent.Create(body, body.GetType(), options: ApiTestBase.Json);
        }

        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return await _http.SendAsync(request, Ct);
    }

    private static string Token(string role) =>
        new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = SitesApiFactory.Issuer,
            Audience = SitesApiFactory.Audience,
            Expires = DateTime.UtcNow.AddMinutes(5),
            Claims = new Dictionary<string, object> { ["roles"] = new[] { role }, ["preferred_username"] = "tester" },
            SigningCredentials = new SigningCredentials(SitesApiFactory.SigningKey, SecurityAlgorithms.HmacSha256),
        });
}
