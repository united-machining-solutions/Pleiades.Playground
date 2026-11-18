using Opc.Ua;
using Pleiades.Playground.OpcUa.Adapter.Mapping;

namespace Pleiades.Playground.OpcUa.Adapter.OpcUa;

/// <summary>
/// A new value of the list of alerts (<c>alerts.list</c>), taken into the alerts that stand. A bad value, or one
/// the adapter cannot decode, changes nothing: one sample that tells nothing must not clear every alert.
/// </summary>
internal static class AlertListValue
{
    /// <summary>
    /// Reconciles the alerts that stand with a new value of the list. Returns what to publish, or null if the value
    /// was not taken; then <paramref name="notTaken"/> says why and the tracker is as it was.
    /// </summary>
    /// <param name="tracker">The alerts that stand.</param>
    /// <param name="value">The value of the node of the list.</param>
    /// <param name="namespaces">The namespaces of the session.</param>
    /// <param name="now">The time, UTC.</param>
    /// <param name="notTaken">Why the value was not taken, or null if it was.</param>
    public static IReadOnlyList<AlertChange>? Take(
        AlertTracker tracker, DataValue value, NamespaceTable namespaces, DateTime now, out string? notTaken)
    {
        ArgumentNullException.ThrowIfNull(tracker);
        if (StatusCode.IsBad(value.StatusCode))
        {
            notTaken = value.StatusCode.ToString();
            return null;
        }

        if (RawValues.AlertsOf(value.WrappedValue, namespaces) is not { } list)
        {
            notTaken = "it is not an array of DataType.Alert of " + Umati2DataModel.Namespace + " the adapter can decode";
            return null;
        }

        notTaken = null;
        return tracker.Reconcile(list, now);
    }
}
