// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;

namespace Pleiades.Playground.Simulator.Production;

/// <summary>Whether the simulator publishes the production events of its virtual machine.</summary>
[SuppressMessage("Performance", "CA1812:Avoid uninstantiated internal classes",
    Justification = "Bound by the configuration binder")]
internal sealed class ProductionEventsConfig
{
    /// <summary>Publish on <c>machines/{SerialNumber}/events/production</c>. On by default.</summary>
    public bool Enabled { get; init; } = true;
}
