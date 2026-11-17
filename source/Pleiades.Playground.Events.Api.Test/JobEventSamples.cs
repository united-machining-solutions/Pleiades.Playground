// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.DataTransferObjects;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>Job events and work master events as a machine sends them, for the tests.</summary>
internal static class JobEventSamples
{
    public static readonly DateTime Start = new(2026, 11, 17, 6, 0, 0, DateTimeKind.Utc);

    /// <summary>
    /// Job order 4711/01: added, released, started (its result comes with the start), one part made (result
    /// changed), then it ends with its result Successful.
    /// </summary>
    public static List<JobEventDao> OneJobOrder(string mId, string jobOrderId = "4711/01")
    {
        long seq = 0;
        JobEventDao Job(int minute, JobAction action, string state, double? produced = null, bool ended = false) => new()
        {
            Id = $"{mId}:{jobOrderId}:{++seq}",
            MId = mId,
            Timestamp = Start.AddMinutes(minute),
            Action = action,
            CorrelationId = jobOrderId,
            JobOrderId = jobOrderId,
            State = state,
            JobName = "Shaft 4711",
            WorkMasterId = "WM-SHAFT-4711",
            OrderNumbers = ["SO-4711"],
            RunsPlanned = 1,
            JobExecutionMode = "ProductionMode",
            StartTime = produced is null ? null : Start.AddMinutes(2),
            EndTime = ended ? Start.AddMinutes(minute) : null,
            ProducedQuantity = produced,
            GoodQuantity = produced,
            RunsCompleted = produced is null ? null : (long)produced,
            ActualProductionTime = produced is null ? null : (minute - 2) * 60,
            JobResult = Result(produced, ended),
            Seq = seq,
        };

        return
        [
            Job(0, JobAction.Added, "NotAllowedToStart"),
            Job(1, JobAction.Released, "AllowedToStart"),
            Job(2, JobAction.Started, "Running", produced: 0),
            Job(7, JobAction.ResultChanged, "Running", produced: 1),
            Job(8, JobAction.Ended, "Ended", produced: 1, ended: true),
            Job(8, JobAction.ResultChanged, "Ended", produced: 1, ended: true),
        ];
    }

    // No result before the start; Unknown until the end.
    private static string? Result(double? produced, bool ended)
    {
        if (produced is null)
        {
            return null;
        }
        return ended ? "Successful" : "Unknown";
    }

    /// <summary>
    /// One program execution of job order 4711/01: started, interrupted, resumed, ended with one part and 720 000 J.
    /// </summary>
    public static List<WorkMasterEventDao> OneExecution(string mId, string jobOrderId = "4711/01", string executionId = "exec-1")
    {
        long seq = 0;
        WorkMasterEventDao Execution(int minute, WorkMasterAction action, string state, bool end = false) => new()
        {
            Id = $"{mId}:{executionId}:{++seq}",
            MId = mId,
            Timestamp = Start.AddMinutes(minute),
            Action = action,
            CorrelationId = executionId,
            ExecutionId = executionId,
            JobOrderId = jobOrderId,
            WorkMasterId = "WM-SHAFT-4711",
            State = state,
            StartTime = Start.AddMinutes(3),
            Duration = end ? 240 : null,
            PartsProduced = end ? 1 : null,
            EnergyElectricity = end ? 720_000 : null,
            Seq = seq,
        };

        return
        [
            Execution(3, WorkMasterAction.Started, "Running"),
            Execution(4, WorkMasterAction.Interrupted, "Interrupted"),
            Execution(5, WorkMasterAction.Resumed, "Running"),
            Execution(7, WorkMasterAction.Ended, "Ended", end: true),
        ];
    }
}
