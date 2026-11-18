using Opc.Ua.Client;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>
/// Hands the OPC UA configuration of the adapter to the OPC UA MCP library before the first scan.
/// Without it the library would look for a configuration file of its own and scan as another
/// application, with another certificate, than the one that runs the machines afterwards.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Instantiated by DI")]
internal sealed class OpcUaConfigurationShare(OpcUaClientOptions options) : IHostedService
{
    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (options.Configuration is null && options.ConfigurationProvider is { } provider)
        {
            options.Configuration = await provider.GetAsync(cancellationToken).ConfigureAwait(false);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
