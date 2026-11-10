namespace Pleiades.Playground.Common.Logging.Models;

/// <summary>
/// Represents the identity and context of the running service.
/// Used for labeling logs and metrics.
/// </summary>
/// <param name="Name">The name of the service (e.g. "My.Api").</param>
/// <param name="Version">The version of the service (e.g. "1.0.0").</param>
/// <param name="InstanceId">The unique instance ID (e.g. pod name or random GUID).</param>
/// <param name="Environment">The environment name (e.g. "Production", "Staging").</param>
public record ServiceInfo(string Name, string Version, string InstanceId, string Environment);
