namespace Pleiades.Playground.Cutting.Adapter.Test;

/// <summary>A clock that stands still until the test moves it on.</summary>
internal sealed class FixedTime(DateTimeOffset now) : TimeProvider
{
    private DateTimeOffset _now = now;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}
