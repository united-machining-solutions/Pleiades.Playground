using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using Moq;
using Opc.Ua;
using Opc.Ua.Client.Discovery;
using Pleiades.Playground.OpcUa.Adapter.McpTools;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

/// <summary>
/// The connect tool of the scan through the MCP server of the adapter, as the chat calls it: its schema, and the
/// filter of the server in front of it. Nothing here reaches an OPC UA server.
/// </summary>
[TestClass]
public class McpScanTest
{
    private const string Url = "opc.tcp://machine:4840";

    public required TestContext TestContext { get; set; }

    [TestMethod]
    public async Task The_connect_tool_takes_no_user_name_and_no_password()
    {
        using var directory = new TemporaryDirectory();
        await using var scope = await Start(directory.Path);

        var tools = await scope.Client.ListToolsAsync(cancellationToken: TestContext.CancellationToken);

        var connect = tools.Single(tool => tool.Name == ScanConnect.ToolName);
        var properties = connect.JsonSchema.GetProperty("properties").EnumerateObject().Select(property => property.Name).ToList();
        CollectionAssert.Contains(properties, "endpointUrl");
        CollectionAssert.DoesNotContain(properties, "username");
        CollectionAssert.DoesNotContain(properties, "password");
        CollectionAssert.DoesNotContain(properties, "authType");
    }

    [TestMethod]
    public async Task A_call_that_brings_a_user_is_refused_by_the_server()
    {
        using var directory = new TemporaryDirectory();
        await using var scope = await Start(directory.Path);

        var result = await scope.Client.CallToolAsync(
            ScanConnect.ToolName,
            new Dictionary<string, object?> { ["endpointUrl"] = Url, ["username"] = "admin", ["password"] = "admin" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual(ScanConnect.Refusal, ((TextContentBlock)result.Content[0]).Text);
    }

    [TestMethod]
    public async Task A_stored_password_does_not_go_to_another_certificate()
    {
        using var directory = new TemporaryDirectory();
        new CredentialStore(directory.Path).Save(Url, new Credential("operator", "s3cret-pass", "0000"));
        // Another box answers at the address, with a certificate of its own.
        var discovery = new Mock<IOpcUaDiscoveryService>();
        discovery
            .Setup(service => service.GetEndpointsAsync(It.IsAny<string>(), It.IsAny<ArrayOf<string>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new EndpointDescription[]
            {
                new()
                {
                    EndpointUrl = Url,
                    SecurityMode = MessageSecurityMode.SignAndEncrypt,
                    SecurityPolicyUri = SecurityPolicies.Aes256_Sha256_RsaPss,
                    ServerCertificate = ByteString.From([9, 9, 9]),
                    UserIdentityTokens = new UserTokenPolicy[] { new() { TokenType = UserTokenType.UserName } },
                },
            });
        await using var scope = await Start(directory.Path, services => services.AddSingleton(discovery.Object));

        var result = await scope.Client.CallToolAsync(
            ScanConnect.ToolName,
            new Dictionary<string, object?> { ["endpointUrl"] = Url, ["name"] = "scan" },
            cancellationToken: TestContext.CancellationToken);

        Assert.IsTrue(result.IsError);
        Assert.AreEqual(ScanConnect.CertificateRefusal, ((TextContentBlock)result.Content[0]).Text);
        Assert.DoesNotContain("s3cret-pass", JsonSerializer.Serialize(result));
    }

    [SuppressMessage("Reliability", "CA2000:Dispose objects before losing scope", Justification = "The scope owns and disposes them.")]
    private async Task<Scope> Start(string dataDirectory, Action<IServiceCollection>? configure = null)
    {
        var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Test");
            builder.UseSetting("Config:DataDirectory", dataDirectory);
            // A broker that is not there: the adapter tries to connect in the background, the MCP server answers.
            builder.UseSetting("Config:MqttDestination:ConnectionString", "mqtt://localhost:1");
            builder.UseSetting("Config:Loki:Sinks:0:Name", "Local");
            builder.UseSetting("Config:Loki:Sinks:0:Enabled", "false");
            builder.UseSetting("Config:Loki:Sinks:0:Uri", "http://localhost:3100");
            if (configure is not null)
            {
                builder.ConfigureTestServices(configure);
            }
        });
        var http = factory.CreateClient();
        var transport = new HttpClientTransport(
            new HttpClientTransportOptions { Endpoint = new Uri(http.BaseAddress!, "/mcp") }, http, ownsHttpClient: false);
        var client = await McpClient.CreateAsync(transport, cancellationToken: TestContext.CancellationToken);
        return new Scope(client, http, factory);
    }

    private sealed class Scope(McpClient client, HttpClient http, WebApplicationFactory<Program> factory) : IAsyncDisposable
    {
        public McpClient Client { get; } = client;

        public async ValueTask DisposeAsync()
        {
            await Client.DisposeAsync();
            http.Dispose();
            await factory.DisposeAsync();
        }
    }
}
