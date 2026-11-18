using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace Pleiades.Playground.OpcUa.Adapter.Registrations;

/// <summary>A registration that was proposed and tried, and waits for a person to say yes.</summary>
/// <param name="Id">The identifier the person's yes names.</param>
/// <param name="Registration">The registration, with the certificate of the server it was tried with.</param>
/// <param name="ExpiresAt">When the proposal is forgotten.</param>
internal sealed record Draft(string Id, MachineRegistration Registration, DateTimeOffset ExpiresAt);

/// <summary>
/// Holds proposals between the scan and the yes. A language model can put a proposal here, and
/// nothing else: adding the machine takes a request that only a person's click sends. A proposal
/// lives in memory and for half an hour, because the server it was tried against may change.
/// </summary>
internal sealed class DraftStore
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(30);
    private readonly ConcurrentDictionary<string, Draft> _drafts = new(StringComparer.Ordinal);
    private readonly TimeProvider _time;

    /// <summary>Creates the store.</summary>
    public DraftStore(TimeProvider? time = null)
    {
        _time = time ?? TimeProvider.System;
    }

    /// <summary>Keeps a registration as a proposal.</summary>
    public Draft Add(MachineRegistration registration)
    {
        ArgumentNullException.ThrowIfNull(registration);
        Prune();
        var draft = new Draft(Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(8)), registration, _time.GetUtcNow() + Lifetime);
        _drafts[draft.Id] = draft;
        return draft;
    }

    /// <summary>The proposal with this identifier, or null if there is none or it has expired.</summary>
    public Draft? Find(string id)
    {
        Prune();
        return _drafts.GetValueOrDefault(id);
    }

    /// <summary>Forgets a proposal: it was committed or turned down.</summary>
    public bool Remove(string id) => _drafts.TryRemove(id, out _);

    private void Prune()
    {
        var now = _time.GetUtcNow();
        foreach (var draft in _drafts.Values.Where(draft => draft.ExpiresAt <= now).ToList())
        {
            _drafts.TryRemove(draft.Id, out _);
        }
    }
}
