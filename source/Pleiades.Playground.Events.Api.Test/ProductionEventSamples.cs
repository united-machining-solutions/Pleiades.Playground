// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>Production events as a machine sends them, for the tests.</summary>
internal static class ProductionEventSamples
{
    public static readonly DateTime Start = new(2026, 11, 17, 6, 0, 0, DateTimeKind.Utc);

    /// <summary>
    /// Job order 4711/01: added, released, started, one program execution that is interrupted, resumed and ends with
    /// one part and 720 000 J, a change of quantity, then the job order ends.
    /// </summary>
    public static List<ProductionEventDao> OneJobOrderWithOneExecution(string mId, string jobOrderId = "4711/01", string executionId = "exec-1")
    {
        long seq = 0;
        ProductionEventDao Job(int minute, ProductionAction action, string state, double? produced = null, bool ended = false) => new()
        {
            Id = $"{mId}:{jobOrderId}:{++seq}",
            MId = mId,
            Timestamp = Start.AddMinutes(minute),
            Subject = ProductionSubject.JobOrder,
            Action = action,
            CorrelationId = jobOrderId,
            JobOrderId = jobOrderId,
            State = state,
            StartTime = minute >= 2 ? Start.AddMinutes(2) : null,
            EndTime = ended ? Start.AddMinutes(minute) : null,
            ProducedQuantity = produced,
            GoodQuantity = produced,
            Seq = seq,
        };
        ProductionEventDao Execution(int minute, ProductionAction action, string state, bool end = false) => new()
        {
            Id = $"{mId}:{executionId}:{++seq}",
            MId = mId,
            Timestamp = Start.AddMinutes(minute),
            Subject = ProductionSubject.ProgramExecution,
            Action = action,
            CorrelationId = executionId,
            JobOrderId = jobOrderId,
            ExecutionId = executionId,
            WorkMaster = "SHAFT.MPF",
            State = state,
            StartTime = Start.AddMinutes(3),
            Duration = end ? 240 : null,
            PartsProduced = end ? 1 : null,
            EnergyElectricity = end ? 720_000 : null,
            Seq = seq,
        };

        return
        [
            Job(0, ProductionAction.Added, "NotAllowedToStart"),
            Job(1, ProductionAction.Released, "AllowedToStart"),
            Job(2, ProductionAction.Started, "Running", produced: 0),
            Execution(3, ProductionAction.Started, "Running"),
            Execution(4, ProductionAction.Interrupted, "Interrupted"),
            Execution(5, ProductionAction.Resumed, "Running"),
            Execution(7, ProductionAction.Ended, "Ended", end: true),
            Job(7, ProductionAction.Changed, "Running", produced: 1),
            Job(8, ProductionAction.Ended, "Ended", produced: 1, ended: true),
        ];
    }
}
