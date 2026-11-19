namespace Pleiades.Playground.Bend.Simulator.Processing;

/// <summary>The state of the automatic processing, as the web page shows it.</summary>
internal enum AutomaticProcessingState
{
    Idle,
    Running,
    Completed,
    Cancelled,
    Failed,
}

/// <summary>
/// Progress of one run of the automatic processing. Written by the background task, read by the web page.
/// </summary>
internal sealed class AutomaticProcessingJob(string productionPackageName, int positionCount, TimeProvider time) : IDisposable
{
    private readonly Lock _syncRoot = new();
    private readonly CancellationTokenSource _cancellation = new();
    private readonly DateTime _startedAt = time.GetLocalNow().DateTime;
    private AutomaticProcessingState _state = AutomaticProcessingState.Running;
    private string? _currentOrderNo;
    private int _currentPositionIndex;
    private int _processedParts;
    private int _desiredParts;
    private int _sentPartFeedbacks;
    private string _message = string.Empty;
    private DateTime? _finishedAt;

    public CancellationToken CancellationToken => _cancellation.Token;

    public bool IsRunning
    {
        get
        {
            lock (_syncRoot)
            {
                return _state == AutomaticProcessingState.Running;
            }
        }
    }

    public void RequestCancellation()
    {
        lock (_syncRoot)
        {
            if (_state == AutomaticProcessingState.Running)
            {
                _cancellation.Cancel();
            }
        }
    }

    public void ReportPositionStarted(int positionIndex, string orderNo)
    {
        lock (_syncRoot)
        {
            _currentPositionIndex = positionIndex;
            _currentOrderNo = orderNo;
            _processedParts = 0;
            _desiredParts = 0;
        }
    }

    public void ReportPartProgress(int processedParts, int desiredParts)
    {
        lock (_syncRoot)
        {
            _processedParts = processedParts;
            _desiredParts = desiredParts;
            _sentPartFeedbacks++;
        }
    }

    public void ReportFinished(AutomaticProcessingState finalState, string message)
    {
        lock (_syncRoot)
        {
            _state = finalState;
            _message = message ?? string.Empty;
            _finishedAt = time.GetLocalNow().DateTime;
        }
    }

    public AutomaticProcessingStatusDto CreateStatusSnapshot()
    {
        lock (_syncRoot)
        {
            return new AutomaticProcessingStatusDto(
                _state,
                productionPackageName,
                _currentOrderNo,
                _currentPositionIndex + 1,
                positionCount,
                _processedParts,
                _desiredParts,
                _sentPartFeedbacks,
                _startedAt,
                _finishedAt,
                _message);
        }
    }

    public void Dispose() => _cancellation.Dispose();
}
