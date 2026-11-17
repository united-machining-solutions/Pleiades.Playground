// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.Json.Nodes;
using Pleiades.Playground.Events.DataTransferObjects;
using Pleiades.Playground.Simulator.Spec;

namespace Pleiades.Playground.Simulator.Production;

/// <summary>
/// Turns an event of the virtual machine into a production event of the playground binding: the same event, the
/// whole state after it, energy in joule instead of watt hours. The data model keeps a job order and its result in
/// two lists; a production event carries both, and a change of the result is a <c>Changed</c> of the job order.
/// </summary>
internal static class ProductionEventMapper
{
    private const string JobOrderPrefix = "JobMonitoring.JobOrder";
    private const string ProgramExecutionPrefix = "WorkMasterMonitoring.ProgramExecution";

    /// <summary>Joule in one watt hour.</summary>
    public const double JoulePerWattHour = 3600;

    /// <summary>
    /// The production event of a job order or program execution event; <see langword="null"/> for any other event.
    /// </summary>
    /// <param name="specEvent">The event of the virtual machine.</param>
    /// <param name="serialNumber">The serial number of the machine, the <c>MId</c>.</param>
    /// <param name="seq">The number of the production event of the machine, counted by the output.</param>
    public static ProductionEventDtoV1? From(SpecEvent specEvent, string serialNumber, long? seq = null)
    {
        ArgumentNullException.ThrowIfNull(specEvent);
        var (subject, action) = specEvent.Path switch
        {
            var p when p.StartsWith(ProgramExecutionPrefix, StringComparison.Ordinal) =>
                (ProductionSubject.ProgramExecution, p[ProgramExecutionPrefix.Length..]),
            var p when p.StartsWith(JobOrderPrefix, StringComparison.Ordinal) =>
                (ProductionSubject.JobOrder, p[JobOrderPrefix.Length..]),
            _ => (default(ProductionSubject?), string.Empty),
        };
        if (subject is null)
        {
            return null;
        }

        if (action == "ResultChanged")
        {
            action = nameof(ProductionAction.Changed);
        }

        // The job order and its result in one: the fields of the two lists do not overlap but for JobOrderID.
        var value = (JsonObject)specEvent.Value.DeepClone();
        foreach (var (name, node) in specEvent.Related ?? [])
        {
            if (!value.ContainsKey(name) && node is not null)
            {
                value[name] = node.DeepClone();
            }
        }
        var jobOrderId = Text(value, "JobOrderID");
        var executionId = Text(value, "ExecutionId");
        return new ProductionEventDtoV1
        {
            Timestamp = specEvent.Timestamp.UtcDateTime,
            // The id of the CloudEvent of the spec output: the same event has the same id in both bindings, and a
            // repeated delivery repeats it.
            Id = specEvent.Id,
            MId = serialNumber,
            Subject = subject.Value,
            Action = Enum.Parse<ProductionAction>(action),
            CorrelationId = (subject == ProductionSubject.JobOrder ? jobOrderId : executionId) ?? string.Empty,
            JobOrderId = jobOrderId,
            ExecutionId = executionId,
            WorkMaster = Text(value, "ActiveWorkMaster"),
            State = Text(value, "State") ?? string.Empty,
            StartTime = Time(value, "StartTime"),
            EndTime = Time(value, "EndTime"),
            ProducedQuantity = Number(value, "ProducedQuantity"),
            GoodQuantity = Number(value, "GoodQuantity"),
            Duration = Number(value, "Duration"),
            PartsProduced = Number(value, "PartsProduced"),
            EnergyElectricity = Number(value, "EnergyElectricity") * JoulePerWattHour,
            EnergyCompressedAir = Number(value, "EnergyCompressedAir") * JoulePerWattHour,
            Seq = seq ?? specEvent.Seq,
        };
    }

    private static string? Text(JsonObject value, string name)
    {
        return value[name]?.GetValue<string>();
    }

    private static double? Number(JsonObject value, string name)
    {
        return value[name] is { } node ? double.Parse(node.ToJsonString(), CultureInfo.InvariantCulture) : null;
    }

    private static DateTime? Time(JsonObject value, string name)
    {
        return Text(value, name) is { } text
            ? DateTime.Parse(text, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal)
            : null;
    }
}
