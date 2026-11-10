namespace Pleiades.Playground.Mcp.Discovery;

/// <summary>
/// Points an agent from the MCP surface of a service to the REST API of the same service.
/// </summary>
/// <param name="OpenApiDocument">
/// Absolute URL of the OpenAPI document as the client reached the service (e.g.
/// <c>https://gateway.example.com/uptime/openapi/v1.json</c> behind a prefix-stripping proxy).
/// </param>
public sealed record RestApiReference(Uri OpenApiDocument);
