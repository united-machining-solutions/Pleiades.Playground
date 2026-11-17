// SPDX-License-Identifier: Apache-2.0
using Pleiades.Playground.Events.Api.DataAccessObjects;
using Pleiades.Playground.Events.Api.Projections;
using Pleiades.Playground.Events.Api.Repositories.MachineEvent;

namespace Pleiades.Playground.Events.Api.Test;

/// <summary>
/// The reads of a mocked <see cref="IMachineEventRepository"/> over events held in memory, as MongoDB answers them:
/// the filter, the runs of <c>sequence</c>, their counts and the events of the alerts not cleared.
/// </summary>
internal static class StoredEvents
{
    /// <summary>Sets up every read of the views on <paramref name="repository"/> over <paramref name="stored"/>.</summary>
    public static Mock<IMachineEventRepository> SetupViews(this Mock<IMachineEventRepository> repository, IReadOnlyList<MachineEventDao> stored)
    {
        repository.Setup(r => r.FindForViewAsync(It.IsAny<MachineEventFilter>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((MachineEventFilter f, CancellationToken _) => new ViewEvents([.. stored.Where(e => Matches(f, e)).OrderBy(e => e.Time)], false));
        repository.Setup(r => r.FindRunsAsync(It.IsAny<MachineEventFilter>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((MachineEventFilter f, CancellationToken _) => MachineEventViews.Runs(stored.Where(e => Matches(f, e))));
        repository.Setup(r => r.FindCountsAsync(It.IsAny<MachineEventFilter>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((MachineEventFilter f, string prefix, CancellationToken _) =>
                [.. stored.Where(e => Matches(f, e) && e.SequencePrefix == prefix && e.SequenceCount is not null).Select(e => e.SequenceCount!.Value)]);
        repository.Setup(r => r.FindOpenAlertEventsAsync(It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string? mId, CancellationToken _) => OpenAlertEvents(stored, mId));
        return repository;
    }

    /// <summary>What the filter of the repository lets through.</summary>
    public static bool Matches(MachineEventFilter filter, MachineEventDao e)
    {
        ArgumentNullException.ThrowIfNull(filter);
        ArgumentNullException.ThrowIfNull(e);
        return (string.IsNullOrEmpty(filter.MId) || e.MId == filter.MId)
            && (string.IsNullOrEmpty(filter.Group) || e.Group == filter.Group)
            && (string.IsNullOrEmpty(filter.Type) || e.Type == filter.Type)
            && (string.IsNullOrEmpty(filter.CorrelationId) || e.CorrelationId == filter.CorrelationId)
            && (string.IsNullOrEmpty(filter.JobOrderId) || (e.Data.Contains("JobOrderID") && e.Data["JobOrderID"].AsString == filter.JobOrderId))
            && (filter.From is null || e.Time >= filter.From)
            && (filter.To is null || e.Time <= filter.To);
    }

    /// <summary>The events of every alert whose last event, by time and then by sequence, is not AlertCleared.</summary>
    public static List<MachineEventDao> OpenAlertEvents(IEnumerable<MachineEventDao> stored, string? mId)
    {
        string[] types = [MachineEventViews.AlertRaised, MachineEventViews.AlertChanged, MachineEventViews.AlertCleared];
        return [.. stored
            .Where(e => (mId is null || e.MId == mId) && e.Group == "Notification" && types.Contains(e.Type)
                && e.Data.Contains("Id") && e.Data["Id"].IsString)
            .GroupBy(e => (e.MId, Id: e.Data["Id"].AsString))
            .Where(g => g.OrderBy(e => e.Time).ThenBy(e => e.Sequence, StringComparer.Ordinal).Last().Type != MachineEventViews.AlertCleared)
            .SelectMany(g => g)
            .OrderBy(e => e.Time)];
    }
}
