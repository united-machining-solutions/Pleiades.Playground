using System.ComponentModel.DataAnnotations;

namespace Pleiades.Playground.Common.Logging.Loki.Configuration;

public class SerilogLokiConfig
{
    public bool EnableDiagnostics { get; set; } = false;

    [MinLength(1)]
    public required List<LokiSinkConfig> Sinks { get; init; }
}
