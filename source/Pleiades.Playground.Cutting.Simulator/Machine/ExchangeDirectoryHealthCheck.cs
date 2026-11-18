using System.Diagnostics.CodeAnalysis;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Pleiades.Playground.Cutting.Protocol.Transport;

namespace Pleiades.Playground.Cutting.Simulator.Machine;

/// <summary>
/// Healthy when the simulator can write into the folder of the telegram files.
/// </summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes", Justification = "Instantiated by DI")]
internal sealed class ExchangeDirectoryHealthCheck(CuttingFileChannel channel) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var directory = channel.Options.Directory;
        var probe = Path.Combine(directory, $".health-{Guid.NewGuid():N}");
        try
        {
            await File.WriteAllBytesAsync(probe, [], cancellationToken).ConfigureAwait(false);
            File.Delete(probe);
            return HealthCheckResult.Healthy($"The folder {directory} is writable.");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return HealthCheckResult.Unhealthy($"The folder {directory} is not writable.", ex);
        }
    }
}
