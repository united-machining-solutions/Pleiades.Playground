using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Pleiades.Playground.Common.Authorization.Test;

/// <summary>
/// The first tests this package has ever had, and they exist because the behaviour they pin was
/// changed with nothing guarding it: <c>AuthStatusHealthCheck</c> reported Degraded when auth was
/// off, no test anywhere asserted that, and the only consumer-side assertion keyed on
/// the <b>word "Degraded"</b> appearing in the response body.
/// </summary>
/// <remarks>
/// The check reports a configuration fact, not a fault. ASP.NET logs every non-Healthy result at
/// Warning on every evaluation, so Degraded re-asserted a constant 8,640 times a day per service at
/// a 10 s probe interval — 17,230 lines in 16 h, measured on one device. The state
/// now travels in <c>Data</c>, which is what the payload was always able to carry.
/// </remarks>
[TestClass]
public sealed class AuthStatusHealthCheckTest
{
    private static readonly HealthCheckContext Context = new();

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task WhenAuthIsOff_ItIsHealthyAndSaysSoInTheData()
    {
        // THE POINT OF THE CHANGE. Healthy, because ASP.NET logs anything else on every single
        // evaluation and this value cannot change while the process lives.
        var result = await Check(enabled: false).ConfigureAwait(false);

        Assert.AreEqual(HealthStatus.Healthy, result.Status,
            "a constant must not be re-asserted at Warning 8,640 times a day; the fact belongs in " +
            "the payload, and Degraded is what put it in the log");
        Assert.IsFalse((bool)result.Data[AuthStatusHealthCheck.EnabledKey],
            "the state has to remain readable - this is the assertion that replaces the status");
        Assert.Contains("DISABLED", result.Description ?? string.Empty, StringComparison.Ordinal,
            "an operator reading /healthcheck must still see it without decoding Data");
    }

    [TestMethod]
    public async Task WhenAuthIsOn_ItIsHealthyAndSaysThatInTheData()
    {
        var result = await Check(enabled: true).ConfigureAwait(false);

        Assert.AreEqual(HealthStatus.Healthy, result.Status);
        Assert.IsTrue((bool)result.Data[AuthStatusHealthCheck.EnabledKey]);
        Assert.AreEqual(AuthStatusHealthCheck.EnabledDescription, result.Description);
    }

    [TestMethod]
    public async Task TheTwoStatesAreDistinguishable_WhichTheStatusNoLongerDoes()
    {
        // THE ASSERTION THAT MAKES THE OTHER TWO WORTH HAVING. Both states are Healthy now, so a
        // test that only checked the status would pass whatever this check did - the exact shape of
        // the consumer-side assertion this change replaces, which searched the body for "Degraded"
        // and would have become a tautology. Data and Description must differ, or the information
        // is gone rather than moved.
        var on = await Check(enabled: true).ConfigureAwait(false);
        var off = await Check(enabled: false).ConfigureAwait(false);

        Assert.AreEqual(on.Status, off.Status, "same status by design - that is the change");
        Assert.AreNotEqual(on.Data[AuthStatusHealthCheck.EnabledKey],
                           off.Data[AuthStatusHealthCheck.EnabledKey],
            "Data is now the only machine-readable difference, so it must actually differ");
        Assert.AreNotEqual(on.Description, off.Description,
            "and the human-readable half must differ too, for the operator reading the JSON");
    }

    [TestMethod]
    public async Task TheDataKeyIsStable_BecauseConsumersReadItByName()
    {
        // THE KEY IS A WIRE CONTRACT, so renaming it breaks consumers with nothing failing to
        // compile: every service that calls AddPleiadesAuthStatus exposes it, and dashboards and
        // tests read it by name.
        // Asserted against the RUNTIME payload, not against the constant. `AreEqual("authenticationEnabled",
        // EnabledKey)` was the obvious way to write this and MSTEST0032 was right to reject it: both
        // sides are compile-time constants, so the condition is known-true and the assertion could
        // never fail. What consumers actually see is the key in the emitted dictionary, so that is
        // what this reads.
        var off = await Check(enabled: false).ConfigureAwait(false);
        var on = await Check(enabled: true).ConfigureAwait(false);

        Assert.Contains("authenticationEnabled", off.Data.Keys.ToList(), StringComparer.Ordinal,
            "the literal is the wire name; renaming the constant silently breaks every consumer");
        Assert.Contains("authenticationEnabled", on.Data.Keys.ToList(), StringComparer.Ordinal,
            "present in BOTH states - a key that appears only when auth is off cannot be read as a " +
            "boolean by a dashboard");
    }

    private async Task<HealthCheckResult> Check(bool enabled)
    {
        var check = new AuthStatusHealthCheck(new AuthOptions { Enabled = enabled });
        return await check.CheckHealthAsync(Context, TestContext.CancellationToken)
            .ConfigureAwait(false);
    }
}
