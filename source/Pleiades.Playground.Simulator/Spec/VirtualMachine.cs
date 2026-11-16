// SPDX-License-Identifier: Apache-2.0
using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using System.Text.Json.Nodes;

namespace Pleiades.Playground.Simulator.Spec;

/// <summary>Who the virtual machine is.</summary>
internal sealed record MachineIdentity(string Manufacturer, string SerialNumber, string ProductInstanceUri);

/// <summary>The counters that only grow, kept across restarts.</summary>
/// <param name="PowerOnDuration">Seconds the machine has been powered.</param>
/// <param name="Energy">Electric energy taken in, in watt hours.</param>
/// <param name="PartsProduced">Parts produced in the lifetime of the machine.</param>
internal sealed record MachineCounters(double PowerOnDuration, double Energy, long PartsProduced);

/// <summary>
/// A machine tool as a state machine, driven by a scenario. Every value and event follows from one state, so they
/// agree with each other: the spindle turns only while a program runs, a job order counts the parts of its program
/// executions, and the energy of a program execution is the integral of the published power over it.
/// </summary>
/// <remarks>
/// The machine is advanced by <see cref="Advance"/> with the current time and returns what changed. It is not
/// thread-safe; the caller serialises access.
/// </remarks>
[SuppressMessage("Security", "CA5394:Do not use insecure randomness", Justification = "Simulation, not security")]
internal sealed class VirtualMachine
{
    private const string NotExecuting = "NotExecuting";
    private const string Executing = "Executing";

    private readonly MachineIdentity _identity;
    private readonly SpecOutputConfig _config;
    private readonly ScenarioConfig _scenario;
    private readonly List<JobTemplate> _jobTemplates;
    private readonly List<double> _feedOverrideSteps;
    private readonly List<double> _spindleOverrideSteps;
    private readonly Random _random;

    private readonly Dictionary<string, SpecValue> _values = [];
    private readonly List<SpecMessage> _pending = [];
    private readonly List<JobOrder> _jobOrders = [];
    private readonly List<ActiveAlert> _alerts = [];

    private DateTimeOffset _now;
    private Phase _phase = Phase.Idle;
    private DateTimeOffset _phaseEnd;
    private Execution? _execution;
    private JobOrder? _activeJob;
    private int _nextJobNumber;
    private int _nextTemplate;
    private bool _jobOrdersChanged;
    private bool _alertsChanged;

    private double _powerOnDuration;
    private double _energy;
    private long _partsProduced;
    private double _power;
    private double _feedOverride;
    private double _spindleOverride;
    private long _heartbeat;
    private long _seq;
    private DateTimeOffset _nextHeartbeat;
    private DateTimeOffset _nextMeasurement;

    public VirtualMachine(MachineIdentity identity, SpecOutputConfig config, MachineCounters counters, DateTimeOffset start)
    {
        ArgumentNullException.ThrowIfNull(identity);
        ArgumentNullException.ThrowIfNull(config);
        ArgumentNullException.ThrowIfNull(counters);
        _identity = identity;
        _config = config;
        _scenario = config.Scenario;
        _jobTemplates = _scenario.Jobs.Count > 0 ? _scenario.Jobs : [new JobTemplate()];
        _feedOverrideSteps = _scenario.FeedOverrideSteps.Count > 0 ? _scenario.FeedOverrideSteps : [1.0];
        _spindleOverrideSteps = _scenario.SpindleOverrideSteps.Count > 0 ? _scenario.SpindleOverrideSteps : [1.0];
        _random = _scenario.Seed is { } seed ? new Random(seed) : new Random();
        _now = start;
        SeqEpoch = SpecWire.Timestamp(start);
        _nextJobNumber = _scenario.FirstJobOrderNumber;
        _powerOnDuration = counters.PowerOnDuration;
        _energy = counters.Energy;
        _partsProduced = counters.PartsProduced;
        _feedOverride = _feedOverrideSteps[0];
        _spindleOverride = _spindleOverrideSteps[0];
        Initialise();
    }

    private enum Phase
    {
        Idle,
        Setup,
        Loading,
        Executing,
        Interrupted,
        Faulted,
    }

    /// <summary>
    /// The epoch of the event numbers: the start of this machine in UTC. <see cref="SpecEvent.Seq"/> counts from 1
    /// within it; a new start begins a new epoch.
    /// </summary>
    public string SeqEpoch { get; }

    /// <summary>The time the machine has reached.</summary>
    public DateTimeOffset Now => _now;

    /// <summary>The current value of every element: the retained image of the broker.</summary>
    public IReadOnlyCollection<SpecValue> Values => _values.Values;

    /// <summary>The counters to keep across a restart.</summary>
    public MachineCounters Counters => new(_powerOnDuration, _energy, _partsProduced);

    /// <summary>
    /// The values set when the machine was created, all of them. Call once, before the first <see cref="Advance"/>.
    /// </summary>
    public IReadOnlyList<SpecMessage> TakeInitialMessages()
    {
        return Flush();
    }

    /// <summary>Advances the machine to <paramref name="now"/> and returns the values and events that came up.</summary>
    public IReadOnlyList<SpecMessage> Advance(DateTimeOffset now)
    {
        var elapsed = now - _now;
        if (elapsed <= TimeSpan.Zero)
        {
            return [];
        }

        // The power published since the last step held until now; the energy is its integral.
        _energy += _power * elapsed.TotalHours;
        _powerOnDuration += elapsed.TotalSeconds;
        _now = now;

        ChangeOverrides(elapsed);
        UpdateAlerts();
        RunPhase(elapsed);
        RaiseAlerts(elapsed);
        RemoveExpiredJobOrders();
        PublishPeriodic();
        return Flush();
    }

    private void Initialise()
    {
        Set(SpecElements.Manufacturer, _identity.Manufacturer);
        Set(SpecElements.SerialNumber, _identity.SerialNumber);
        Set(SpecElements.ProductInstanceUri, _identity.ProductInstanceUri);
        _heartbeat = 1;
        Set(SpecElements.Heartbeat, _heartbeat);
        _nextHeartbeat = _now + _config.HeartbeatInterval;
        SetStatus(NotExecuting, "Processing");
        Set(SpecElements.ChannelState, "Reset");
        Set(SpecElements.ActiveProgram, (JsonNode?)null);
        Set(SpecElements.ProgramExecution, (JsonNode?)null);
        Set(SpecElements.FeedOverride, _feedOverride);
        Set(SpecElements.SpindleIsRotating, false);
        Set(SpecElements.SpindleOverride, _spindleOverride);
        Set(SpecElements.PartsProducedInLifetime, _partsProduced);
        // The first list comes with its events too, so that the events alone give the same list.
        for (var i = 0; i < _scenario.QueuedJobOrders; i++)
        {
            AddJobOrder();
        }
        PromoteNextJobOrder();
        _jobOrdersChanged = true;
        _alertsChanged = true;
        UpdatePower();
        PublishMeasurements();
        _phaseEnd = _now;
    }

    private void RunPhase(TimeSpan elapsed)
    {
        switch (_phase)
        {
            case Phase.Idle when _now >= _phaseEnd && !HasFailure():
                StartJobOrder();
                break;
            case Phase.Setup when _now >= _phaseEnd:
            case Phase.Loading when _now >= _phaseEnd:
                StartExecution();
                break;
            case Phase.Executing:
                Execute(elapsed);
                break;
            case Phase.Interrupted when !HasFailure():
                ResumeExecution();
                break;
            case Phase.Faulted when !HasFailure():
                EnterPhase(Phase.Idle, _scenario.IdleTime);
                break;
            default:
                break;
        }
    }

    private void StartJobOrder()
    {
        var job = _jobOrders.FirstOrDefault(j => j.State == "AllowedToStart");
        if (job is null)
        {
            PromoteNextJobOrder();
            return;
        }

        job.StartTime = _now;
        job.ProducedQuantity = 0;
        job.GoodQuantity = 0;
        ChangeJobState(job, "Running");
        _activeJob = job;

        // Keep the queue full: the next one may start, a new one waits.
        AddJobOrder();
        PromoteNextJobOrder();

        Set(SpecElements.ActiveProgram, job.Template.Program);
        EnterPhase(Phase.Setup, _scenario.SetupTime);
    }

    private void StartExecution()
    {
        var job = _activeJob!;
        var executionId = NewId();
        _execution = new Execution(executionId, _now, _energy, job);

        var snapshot = new JsonObject
        {
            ["ExecutionId"] = executionId,
            ["JobOrderID"] = job.Id,
            ["ActiveProgram"] = job.Template.Program,
        };
        Set(SpecElements.ProgramExecution, snapshot, executionId);
        Set(SpecElements.ActiveProgram, job.Template.Program, executionId);
        Emit(SpecElements.ProgramExecutionStarted, (JsonObject)snapshot.DeepClone());
        EnterPhase(Phase.Executing, TimeSpan.Zero);
    }

    private void Execute(TimeSpan elapsed)
    {
        var execution = _execution!;
        execution.Progress += elapsed.TotalSeconds * _feedOverride;
        execution.Job.ActualProductionTime += elapsed.TotalSeconds;
        if (execution.Progress < execution.Job.Template.CycleTime.TotalSeconds)
        {
            return;
        }

        var job = execution.Job;
        EndExecution("Completed");
        if (job.ProducedQuantity >= job.Template.Quantity)
        {
            job.EndTime = _now;
            job.JobResult = "Successful";
            ChangeJobState(job, "Ended");
            _activeJob = null;
            Set(SpecElements.ActiveProgram, job.Template.Program);
            EnterPhase(Phase.Idle, _scenario.IdleTime);
        }
        else
        {
            EnterPhase(Phase.Loading, _scenario.LoadTime);
        }
    }

    private void EndExecution(string endState)
    {
        var execution = _execution!;
        var job = execution.Job;
        var completed = endState == "Completed";
        var ended = new JsonObject
        {
            ["ExecutionId"] = execution.Id,
            ["JobOrderID"] = job.Id,
            ["EndState"] = endState,
            ["Duration"] = Math.Round((_now - execution.Start).TotalSeconds, 3),
            ["PartsProduced"] = completed ? 1 : 0,
            ["EnergyElectricity"] = Math.Round(_energy - execution.EnergyAtStart, 3),
        };
        _execution = null;

        if (completed)
        {
            _partsProduced++;
            job.ProducedQuantity++;
            if (_random.NextDouble() >= _scenario.ScrapRate)
            {
                job.GoodQuantity++;
            }
            Set(SpecElements.PartsProducedInLifetime, _partsProduced);
            ChangeJob(job);
        }

        Set(SpecElements.ProgramExecution, (JsonNode?)null);
        Set(SpecElements.ActiveProgram, job.Template.Program);
        Emit(SpecElements.ProgramExecutionEnded, ended);
    }

    private void InterruptExecution()
    {
        ChangeJobState(_execution!.Job, "Interrupted");
        EnterPhase(Phase.Interrupted, TimeSpan.Zero);
    }

    private void ResumeExecution()
    {
        ChangeJobState(_execution!.Job, "Running");
        EnterPhase(Phase.Executing, TimeSpan.Zero);
    }

    private void AbortExecution()
    {
        var job = _execution!.Job;
        EndExecution("Aborted");
        job.EndTime = _now;
        job.JobResult = "Unsuccessful";
        ChangeJobState(job, "Aborted");
        _activeJob = null;
        EnterPhase(Phase.Faulted, TimeSpan.Zero);
    }

    /// <summary>Sets the phase and everything that follows from it: status, channel, spindle and power.</summary>
    private void EnterPhase(Phase phase, TimeSpan duration)
    {
        _phase = phase;
        _phaseEnd = _now + duration;
        var executionId = _execution?.Id;
        switch (phase)
        {
            case Phase.Setup:
                SetStatus(NotExecuting, "Setup");
                Set(SpecElements.ChannelState, "Reset");
                break;
            case Phase.Executing:
                SetStatus(Executing, "Processing");
                Set(SpecElements.ChannelState, "Active", executionId);
                break;
            case Phase.Interrupted:
                SetStatus(NotExecuting, "Processing");
                Set(SpecElements.ChannelState, "Interrupted", executionId);
                break;
            default:
                SetStatus(NotExecuting, "Processing");
                Set(SpecElements.ChannelState, "Reset");
                break;
        }
        Set(SpecElements.SpindleIsRotating, phase == Phase.Executing);
        UpdatePower();
    }

    private void UpdateAlerts()
    {
        foreach (var alert in _alerts.ToList())
        {
            if (_now >= alert.Since + alert.Template.Duration)
            {
                _alerts.Remove(alert);
                _alertsChanged = true;
                Emit(SpecElements.AlertCleared, alert.ToJson());
            }
            else if (!alert.Changed && alert.Template.ChangeAfter is { } after && _now >= alert.Since + after)
            {
                alert.Changed = true;
                alert.SeverityValue = alert.Template.ChangedSeverityValue ?? alert.SeverityValue;
                _alertsChanged = true;
                Emit(SpecElements.AlertChanged, alert.ToJson());
            }
        }
    }

    private void RaiseAlerts(TimeSpan elapsed)
    {
        foreach (var template in _scenario.Alerts)
        {
            var isFailure = template.Severity == "Failure";
            if ((isFailure && _phase != Phase.Executing) || _alerts.Any(a => a.Template == template))
            {
                continue;
            }
            if (_random.NextDouble() >= template.RatePerHour * elapsed.TotalHours)
            {
                continue;
            }

            var alert = new ActiveAlert(NewId(), template, _now, _execution?.Id);
            _alerts.Add(alert);
            _alertsChanged = true;
            Emit(SpecElements.AlertRaised, alert.ToJson());

            if (isFailure)
            {
                if (_random.NextDouble() < _scenario.AbortOnFailureProbability)
                {
                    AbortExecution();
                }
                else
                {
                    InterruptExecution();
                }
            }
        }
    }

    private bool HasFailure()
    {
        return _alerts.Any(a => a.Template.Severity == "Failure");
    }

    private void ChangeOverrides(TimeSpan elapsed)
    {
        if (_feedOverrideSteps.Count > 1 && _random.NextDouble() < _scenario.FeedOverrideChangesPerHour * elapsed.TotalHours)
        {
            _feedOverride = NextStep(_feedOverrideSteps, _feedOverride);
            Set(SpecElements.FeedOverride, _feedOverride);
        }
        if (_spindleOverrideSteps.Count > 1 && _random.NextDouble() < _scenario.SpindleOverrideChangesPerHour * elapsed.TotalHours)
        {
            _spindleOverride = NextStep(_spindleOverrideSteps, _spindleOverride);
            Set(SpecElements.SpindleOverride, _spindleOverride);
        }
    }

    private double NextStep(List<double> steps, double current)
    {
        var others = steps.Where(s => !s.Equals(current)).ToList();
        return others.Count == 0 ? current : others[_random.Next(others.Count)];
    }

    private void AddJobOrder()
    {
        var template = _jobTemplates[_nextTemplate];
        _nextTemplate = (_nextTemplate + 1) % _jobTemplates.Count;
        var job = new JobOrder(string.Create(CultureInfo.InvariantCulture, $"{_nextJobNumber++}/01"), template)
        {
            State = "NotAllowedToStart",
            StateSince = _now,
        };
        _jobOrders.Add(job);
        _jobOrdersChanged = true;
        Emit(SpecElements.JobOrderAdded, job.ToJson());
    }

    private void PromoteNextJobOrder()
    {
        if (_jobOrders.Any(j => j.State == "AllowedToStart"))
        {
            return;
        }
        var next = _jobOrders.FirstOrDefault(j => j.State == "NotAllowedToStart");
        if (next is null)
        {
            return;
        }
        ChangeJobState(next, "AllowedToStart");
    }

    private void ChangeJobState(JobOrder job, string state)
    {
        job.State = state;
        job.StateSince = _now;
        ChangeJob(job);
    }

    private void ChangeJob(JobOrder job)
    {
        _jobOrdersChanged = true;
        Emit(SpecElements.JobOrderChanged, job.ToJson());
    }

    private void RemoveExpiredJobOrders()
    {
        foreach (var job in _jobOrders.Where(j => j.EndTime is { } end && _now >= end + _scenario.JobOrderRetention).ToList())
        {
            _jobOrders.Remove(job);
            _jobOrdersChanged = true;
            Emit(SpecElements.JobOrderRemoved, job.ToJson());
        }
    }

    private void PublishPeriodic()
    {
        if (_now >= _nextHeartbeat)
        {
            _heartbeat++;
            Set(SpecElements.Heartbeat, _heartbeat);
            _nextHeartbeat += _config.HeartbeatInterval;
            if (_nextHeartbeat <= _now)
            {
                _nextHeartbeat = _now + _config.HeartbeatInterval;
            }
        }
        if (_now >= _nextMeasurement)
        {
            UpdatePower();
            PublishMeasurements();
        }
    }

    private void PublishMeasurements()
    {
        Set(SpecElements.ActiveEnergy, Math.Round(_energy, 3));
        Set(SpecElements.PowerOnDuration, Math.Round(_powerOnDuration));
        _nextMeasurement = _now + _config.MeasurementInterval;
    }

    private void UpdatePower()
    {
        var level = _phase switch
        {
            Phase.Executing => _execution!.Job.Template.ExecutingPower,
            Phase.Setup or Phase.Loading => _scenario.SetupPower,
            _ => _scenario.IdlePower,
        };
        var noise = 1 + (_scenario.PowerNoise * ((2 * _random.NextDouble()) - 1));
        _power = Math.Round(level * noise, 1);
        Set(SpecElements.ActivePower, _power);
    }

    private void SetStatus(string itemState, string operationMode)
    {
        Set(SpecElements.Status, new JsonObject
        {
            ["MachineryItemState"] = itemState,
            ["MachineryOperationMode"] = operationMode,
        });
    }

    private void Set(string path, JsonNode? value, string? correlationId = null)
    {
        if (_values.TryGetValue(path, out var current)
            && current.CorrelationId == correlationId
            && JsonNode.DeepEquals(current.Value, value))
        {
            return;
        }
        var specValue = new SpecValue(path, value, SpecElements.UnitOf(path), _now, correlationId);
        _values[path] = specValue;
        _pending.Add(specValue);
    }

    private void Set(string path, string value, string? correlationId = null)
    {
        Set(path, JsonValue.Create(value), correlationId);
    }

    private void Set(string path, double value)
    {
        Set(path, JsonValue.Create(value));
    }

    private void Set(string path, long value)
    {
        Set(path, JsonValue.Create(value));
    }

    private void Set(string path, bool value)
    {
        Set(path, JsonValue.Create(value));
    }

    private void Emit(string path, JsonObject value)
    {
        _pending.Add(new SpecEvent(path, _now, ++_seq, value));
    }

    private List<SpecMessage> Flush()
    {
        if (_jobOrdersChanged)
        {
            _jobOrdersChanged = false;
            Set(SpecElements.JobOrders, new JsonArray([.. _jobOrders.Select(j => (JsonNode)j.ToJson())]));
        }
        if (_alertsChanged)
        {
            _alertsChanged = false;
            Set(SpecElements.ActiveAlerts, new JsonArray([.. _alerts.Select(a => (JsonNode)a.ToJson())]));
        }
        var messages = _pending.ToList();
        _pending.Clear();
        return messages;
    }

    private string NewId()
    {
        Span<byte> bytes = stackalloc byte[16];
        _random.NextBytes(bytes);
        return new Guid(bytes).ToString();
    }

    private sealed class Execution(string id, DateTimeOffset start, double energyAtStart, JobOrder job)
    {
        public string Id { get; } = id;
        public DateTimeOffset Start { get; } = start;
        public double EnergyAtStart { get; } = energyAtStart;
        public JobOrder Job { get; } = job;
        public double Progress { get; set; }
    }

    private sealed class JobOrder(string id, JobTemplate template)
    {
        public string Id { get; } = id;
        public JobTemplate Template { get; } = template;
        public string State { get; set; } = "NotAllowedToStart";
        public DateTimeOffset StateSince { get; set; }
        public DateTimeOffset? StartTime { get; set; }
        public DateTimeOffset? EndTime { get; set; }
        public double ProducedQuantity { get; set; }
        public double GoodQuantity { get; set; }
        public double ActualProductionTime { get; set; }
        public string? JobResult { get; set; }

        public JsonObject ToJson()
        {
            var json = new JsonObject
            {
                ["JobOrderID"] = Id,
                [nameof(State)] = State,
            };
            if (StartTime is { } start)
            {
                json[nameof(ProducedQuantity)] = ProducedQuantity;
                json[nameof(GoodQuantity)] = GoodQuantity;
                json[nameof(StartTime)] = SpecWire.Timestamp(start);
            }
            if (EndTime is { } end)
            {
                json[nameof(EndTime)] = SpecWire.Timestamp(end);
            }
            if (StartTime is not null)
            {
                json[nameof(ActualProductionTime)] = Math.Round(ActualProductionTime, 3);
            }
            json[nameof(StateSince)] = SpecWire.Timestamp(StateSince);
            json["JobName"] = Template.JobName;
            if (JobResult is not null)
            {
                json[nameof(JobResult)] = JobResult;
            }
            return json;
        }
    }

    private sealed class ActiveAlert(string id, AlertTemplate template, DateTimeOffset since, string? correlationId)
    {
        public string Id { get; } = id;
        public AlertTemplate Template { get; } = template;
        public DateTimeOffset Since { get; } = since;
        public string? CorrelationId { get; } = correlationId;
        public int? SeverityValue { get; set; } = template.SeverityValue;
        public bool Changed { get; set; }

        public JsonObject ToJson()
        {
            var json = new JsonObject
            {
                ["id"] = Id,
                ["code"] = Template.Code,
                ["text"] = Template.Text,
                ["severity"] = Template.Severity,
            };
            if (SeverityValue is { } value)
            {
                json["severityValue"] = value;
            }
            json["since"] = SpecWire.Timestamp(Since);
            if (Template.Source is { Length: > 0 } source)
            {
                json["source"] = source;
            }
            if (CorrelationId is not null)
            {
                json["correlationId"] = CorrelationId;
            }
            return json;
        }
    }
}
