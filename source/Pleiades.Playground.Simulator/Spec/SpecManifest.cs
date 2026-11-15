// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>The manifest of the virtual machine: model version, profiles, elements and events it delivers.</summary>
internal static class SpecManifest
{
    /// <summary>The least retention of ended job orders the data model allows, in seconds.</summary>
    public const double MinimumJobOrderRetention = 86_400;

    public static JsonObject Build(MachineIdentity identity, SpecOutputConfig config)
    {
        ArgumentNullException.ThrowIfNull(identity);
        ArgumentNullException.ThrowIfNull(config);

        var manifest = new JsonObject
        {
            ["modelVersion"] = SpecElements.ModelVersion,
            ["bindingVersion"] = SpecElements.BindingVersion,
            ["machine"] = new JsonObject { ["ProductInstanceUri"] = identity.ProductInstanceUri },
            ["profiles"] = new JsonArray([.. SpecElements.Profiles.Select(p => (JsonNode)p)]),
            ["heartbeatInterval"] = config.HeartbeatInterval.TotalSeconds,
        };

        // A shorter retention is a demo setting that the model does not allow; then the manifest says nothing.
        var retention = config.Scenario.JobOrderRetention.TotalSeconds;
        if (retention >= MinimumJobOrderRetention)
        {
            manifest["jobOrderRetention"] = retention;
        }

        manifest["instances"] = new JsonObject
        {
            ["Channel"] = new JsonObject { ["1"] = "CHAN1" },
            ["Spindle"] = new JsonObject { ["1"] = "S1" },
        };
        manifest["elements"] = new JsonArray([.. SpecElements.Elements.Select(e => (JsonNode)Element(e))]);
        manifest["events"] = new JsonArray([.. SpecElements.Events.Select(e => (JsonNode)e)]);
        return manifest;
    }

    private static JsonObject Element(SpecElement element)
    {
        var json = new JsonObject
        {
            ["path"] = element.Path,
            ["timestampSource"] = element.TimestampSource,
        };
        if (element.CorrelationId)
        {
            json["correlationId"] = true;
        }
        return json;
    }
}
