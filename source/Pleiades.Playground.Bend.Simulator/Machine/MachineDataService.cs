using Pleiades.Playground.Bend.Protocol.Model;

namespace Pleiades.Playground.Bend.Simulator.Machine;

/// <summary>
/// Machine data reported by hand (MDE): the operating states running, idle, maintenance and fault.
/// </summary>
internal sealed class MachineDataService(SimulatorRuntime runtime, MachineBusyState busyState)
{
    public CommandResult SendOperatingState(SendOperatingStateRequest? request)
    {
        if (request is null || !Enum.IsDefined(request.OperatingState))
        {
            return CommandResult.Failure(CommandError.InvalidInput, "Unknown operating state.");
        }

        if (busyState.IsBusy)
        {
            return CommandResult.Failure(CommandError.MachineBusy, "Not possible during automatic processing.");
        }

        switch (request.OperatingState)
        {
            case OperatingStateCommand.Running:
                runtime.Telegrams.SendOperatingState(RciOperatingState.Running);
                break;
            case OperatingStateCommand.Idle:
                runtime.Telegrams.SendOperatingState(RciOperatingState.Idle);
                break;
            case OperatingStateCommand.Maintenance:
                runtime.Telegrams.SendOperatingState(RciOperatingState.Maintenance);
                break;
            case OperatingStateCommand.Error:
                runtime.Telegrams.SendOperatingState(RciOperatingState.Fault, request.ErrorNo, request.ErrorText);
                break;
        }

        return CommandResult.Success($"Operating state '{request.OperatingState}' sent.");
    }
}
