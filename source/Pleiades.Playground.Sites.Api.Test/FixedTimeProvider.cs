namespace Pleiades.Playground.Sites.Api.Test;

/// <summary>A clock that stands still until a test sets it.</summary>
internal sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;

    public override DateTimeOffset GetUtcNow() => Now;
}
