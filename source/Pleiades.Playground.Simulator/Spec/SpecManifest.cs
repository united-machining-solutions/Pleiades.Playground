// SPDX-License-Identifier: Apache-2.0
using System.Text.Json.Nodes;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>The manifest of the virtual machine: model version, profiles, elements and events it delivers.</summary>
internal static class SpecManifest
{
    /// <summary>
    /// The machine id of the spec binding for this machine, from the values it publishes: its ManufacturerUri, Model
    /// and SerialNumber.
    /// </summary>
    public static string MachineId(MachineIdentity identity, SpecOutputConfig config)
    {
        ArgumentNullException.ThrowIfNull(identity);
        ArgumentNullException.ThrowIfNull(config);
        return SpecWire.MachineId(config.EffectiveManufacturerUri, config.Scenario.Model, identity.SerialNumber);
    }

    public static JsonObject Build(MachineIdentity identity, SpecOutputConfig config)
    {
        ArgumentNullException.ThrowIfNull(identity);
        ArgumentNullException.ThrowIfNull(config);

        var manifest = new JsonObject
        {
            ["modelVersion"] = SpecElements.ModelVersion,
            ["bindingVersion"] = SpecElements.BindingVersion,
            // A field of the binding: the level of the topics, so that no consumer has to form it.
            ["machineId"] = MachineId(identity, config),
            ["machine"] = new JsonObject { ["ProductInstanceUri"] = identity.ProductInstanceUri },
            ["profiles"] = new JsonArray([.. SpecElements.Profiles.Select(p => (JsonNode)p)]),
            ["heartbeatInterval"] = config.HeartbeatInterval.TotalSeconds,
        };

        // How long ended job orders stay: the machine decides, the model sets no least time.
        manifest["jobOrderRetention"] = config.Scenario.JobOrderRetention.TotalSeconds;

        manifest["instances"] = new JsonObject
        {
            ["Channel"] = new JsonObject { ["1"] = VirtualMachine.ChannelName },
            ["Spindle"] = new JsonObject { ["1"] = VirtualMachine.SpindleName },
        };
        var unavailable = new HashSet<string>(config.Scenario.Unavailable.Concat(SpecElements.NotDelivered), StringComparer.Ordinal);
        manifest["elements"] = new JsonArray([.. SpecElements.ElementsFor(config.ManufacturerDomain).Select(e => (JsonNode)Element(e, unavailable))]);
        manifest["events"] = new JsonArray([.. SpecElements.Events.Select(e => (JsonNode)Event(e))]);
        return manifest;
    }

    private static JsonObject Event(SpecEventInfo info)
    {
        var json = new JsonObject { ["path"] = info.Path };
        if (info.CorrelationId)
        {
            json["correlationId"] = true;
        }
        return json;
    }

    private static JsonObject Element(SpecElement element, HashSet<string> unavailable)
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
            if (extension.UnitCode is not null)
            {
                json["unit"] = new JsonObject { ["code"] = extension.UnitCode, ["name"] = extension.UnitName };
            }
            json["description"] = extension.Description;
        }
        return json;
    }
}
