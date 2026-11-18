namespace Pleiades.Playground.Nats.Bridge;

/// <summary>
/// What the last publish came to. The health check reads it: a connection that stands but takes nothing (no stream
/// for the subjects, no permission) is not healthy.
/// </summary>
internal sealed class PublishOutcome
{
    private volatile string? _lastDrop;

    /// <summary>Why the last message was dropped, or null when the last publish went through (or none was tried).</summary>
    public string? LastDrop => _lastDrop;

    public void Succeeded() => _lastDrop = null;

    public void Dropped(string reason) => _lastDrop = reason;
}
