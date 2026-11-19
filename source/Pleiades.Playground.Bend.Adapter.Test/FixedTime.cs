namespace Pleiades.Playground.Bend.Adapter.Test;

/// <summary>A clock that stands still until the test moves it on.</summary>
internal sealed class FixedTime(DateTimeOffset now) : TimeProvider
{
    private DateTimeOffset _now = now;

    public override DateTimeOffset GetUtcNow() => _now;

    public override TimeZoneInfo LocalTimeZone => TimeZoneInfo.Utc;

    public void Advance(TimeSpan by) => _now += by;
}
