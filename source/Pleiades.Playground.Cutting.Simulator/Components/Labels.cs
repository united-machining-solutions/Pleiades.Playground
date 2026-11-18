using Pleiades.Playground.Cutting.Protocol.Model;
using Pleiades.Playground.Cutting.Simulator.Machine;

namespace Pleiades.Playground.Cutting.Simulator.Components;

/// <summary>
/// Texts and styles the pages share.
/// </summary>
internal static class Labels
{
    public static string State(OperatingState state) => state switch
    {
        OperatingState.Off => "Off",
        OperatingState.Idle => "Idle",
        OperatingState.Running => "Running",
        OperatingState.Waiting => "Waiting",
        OperatingState.Fault => "Fault",
        _ => state.ToString(),
    };

    /// <summary>The CSS class of a badge for the state.</summary>
    public static string StateTone(OperatingState state) => state switch
    {
        OperatingState.Running => "ok",
        OperatingState.Waiting => "warn",
        OperatingState.Fault => "bad",
        _ => "neutral",
    };

    public static string Status(CuttingOrderStatus status) => status switch
    {
        CuttingOrderStatus.Free => "Free",
        CuttingOrderStatus.Active => "Active",
        CuttingOrderStatus.Paused => "Paused",
        CuttingOrderStatus.Locked => "Locked",
        CuttingOrderStatus.Completed => "Completed",
        CuttingOrderStatus.NoMaterial => "No material",
        CuttingOrderStatus.Faulted => "Faulted",
        _ => status.ToString(),
    };

    public static string StatusTone(CuttingOrderStatus status) => status switch
    {
        CuttingOrderStatus.Active => "ok",
        CuttingOrderStatus.Free => "info",
        CuttingOrderStatus.Completed => "neutral",
        CuttingOrderStatus.Locked or CuttingOrderStatus.Paused => "warn",
        _ => "bad",
    };

    public static string Direction(TelegramDirection direction) => direction switch
    {
        TelegramDirection.In => "Host → machine",
        TelegramDirection.Out => "Machine → host",
        TelegramDirection.Held => "Held",
        TelegramDirection.Error => "Error",
        _ => direction.ToString(),
    };

    public static string DirectionTone(TelegramDirection direction) => direction switch
    {
        TelegramDirection.In => "info",
        TelegramDirection.Out => "ok",
        TelegramDirection.Held => "warn",
        _ => "bad",
    };
}
