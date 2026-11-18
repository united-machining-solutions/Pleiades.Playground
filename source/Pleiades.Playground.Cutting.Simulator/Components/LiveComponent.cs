using Microsoft.AspNetCore.Components;
using Pleiades.Playground.Cutting.Simulator.Machine;

namespace Pleiades.Playground.Cutting.Simulator.Components;

/// <summary>
/// A component that draws itself again when the machine or the telegram log changes. The runner changes the
/// progress ten times a second; the component draws at most four times a second.
/// </summary>
[System.Diagnostics.CodeAnalysis.SuppressMessage("Design", "CA1515:Consider making public types internal",
    Justification = "The generated page classes are public and derive from it.")]
public abstract class LiveComponent : ComponentBase, IDisposable
{
    private static readonly TimeSpan Interval = TimeSpan.FromMilliseconds(250);

    private PeriodicTimer? _timer;
    private volatile bool _dirty;
    private bool _disposed;

    [Inject]
    internal CuttingMachine Machine { get; set; } = default!;

    [Inject]
    internal TelegramLog Log { get; set; } = default!;

    [Inject]
    internal MachineActions Actions { get; set; } = default!;

    /// <summary>The state when the component last drew.</summary>
    internal MachineSnapshot State { get; private set; } = default!;

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }

    protected override void OnInitialized()
    {
        State = Machine.Snapshot();
        Machine.Changed += OnChanged;
        Log.Added += OnChanged;
        _timer = new PeriodicTimer(Interval);
        _ = RefreshLoopAsync(_timer);
    }

    protected override void OnParametersSet()
    {
        State = Machine.Snapshot();
    }

    protected virtual void Dispose(bool disposing)
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        if (disposing)
        {
            Machine.Changed -= OnChanged;
            Log.Added -= OnChanged;
            _timer?.Dispose();
        }
    }

    /// <summary>Runs an action of the page and draws the result at once.</summary>
    protected async Task Do(Func<Task> action)
    {
        ArgumentNullException.ThrowIfNull(action);
        await action().ConfigureAwait(true);
        State = Machine.Snapshot();
        StateHasChanged();
    }

    private void OnChanged(object? sender, EventArgs e)
    {
        _dirty = true;
    }

    private async Task RefreshLoopAsync(PeriodicTimer timer)
    {
        try
        {
            while (await timer.WaitForNextTickAsync().ConfigureAwait(false))
            {
                if (!_dirty)
                {
                    continue;
                }

                _dirty = false;
                await InvokeAsync(() =>
                {
                    State = Machine.Snapshot();
                    StateHasChanged();
                }).ConfigureAwait(false);
            }
        }
        catch (ObjectDisposedException)
        {
            // The page closed.
        }
    }
}
