// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>The manifest of the virtual machine: model version, profiles, elements and events it delivers.</summary>
internal static class SpecManifest
{
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

        // How long ended job orders stay: the machine decides, the model sets no least time.
        manifest["jobOrderRetention"] = config.Scenario.JobOrderRetention.TotalSeconds;

        manifest["instances"] = new JsonObject
        {
            ["Channel"] = new JsonObject { ["1"] = "CHAN1" },
            ["Spindle"] = new JsonObject { ["1"] = "S1" },
        };
        manifest["elements"] = new JsonArray([.. SpecElements.ElementsFor(config.ManufacturerDomain).Select(e => (JsonNode)Element(e, config.Scenario.Unavailable))]);
        manifest["events"] = new JsonArray([.. SpecElements.Events.Select(e => (JsonNode)e)]);
        return manifest;
    }

    private static JsonObject Element(SpecElement element, List<string> unavailable)
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
        if (unavailable.Contains(element.Path))
        {
            json["available"] = false;
        }
        if (element.Extension is { } extension)
        {
            json["type"] = extension.Type;
            json["unit"] = new JsonObject { ["code"] = extension.UnitCode, ["name"] = extension.UnitName };
            json["description"] = extension.Description;
        }
        return json;
    }
}
