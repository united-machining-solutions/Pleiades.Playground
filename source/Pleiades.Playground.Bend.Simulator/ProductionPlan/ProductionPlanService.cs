using Pleiades.Playground.Bend.Protocol.Model;
using Pleiades.Playground.Bend.Simulator.Machine;

namespace Pleiades.Playground.Bend.Simulator.ProductionPlan;

/// <summary>
/// Reads the production plan and adds or removes test packages. These changes stay local: no telegram is sent.
/// </summary>
internal sealed class ProductionPlanService(
    SimulatorRuntime runtime,
    MachineBusyState busyState,
    DummyProductionDataFactory dummyData)
{
    public const int MaxGeneratedPackages = 50;
    public const int MaxGeneratedPositionsPerPackage = 20;
    public const int MaxPartsPerPosition = 1000;

    public IReadOnlyList<ProductionPackageDto> GetProductionPlan()
    {
        return runtime.GetProductionPackagesSnapshot().Select(ToDto).ToArray();
    }

    public CommandResult AddProductionPackage(CreateProductionPackageRequest? request)
    {
        var validation = Validate(request);
        return validation.IsSuccess ? AddPackages([DummyProductionDataFactory.CreatePackage(request!)]) : validation;
    }

    public CommandResult GenerateDataset(GenerateDatasetRequest? request)
    {
        var validation = Validate(request);
        return validation.IsSuccess ? AddPackages(dummyData.CreateDataset(request!)) : validation;
    }

    public CommandResult DeleteProductionPackage(string packageName)
    {
        if (busyState.IsBusy)
        {
            return Busy();
        }

        var package = runtime.GetProductionPackagesSnapshot()
            .FirstOrDefault(candidate => string.Equals(candidate.ProductionPackageName, packageName, StringComparison.Ordinal));
        if (package is null)
        {
            return CommandResult.Failure(CommandError.NotFound, $"Package '{packageName}' not found.");
        }

        runtime.ProductionPackages.Remove(package);
        runtime.NotifyChanged();
        return CommandResult.Success($"Package '{packageName}' deleted.");
    }

    private CommandResult AddPackages(IReadOnlyList<ProductionPackage> packages)
    {
        if (busyState.IsBusy)
        {
            return Busy();
        }

        var duplicate = FindDuplicate(runtime.GetProductionPackagesSnapshot(), packages);
        if (!duplicate.IsSuccess)
        {
            return duplicate;
        }

        runtime.ProductionPackages.AddRange(packages);
        runtime.NotifyChanged();
        return CommandResult.Success($"{packages.Count} package(s) created.");
    }

    private static CommandResult Busy() =>
        CommandResult.Failure(CommandError.MachineBusy, "Not possible during automatic processing.");

    /// <summary>
    /// Package names and order numbers are unique on the machine: the automatic processing finds a position by its
    /// order number across every package, so a duplicate would update the wrong one.
    /// </summary>
    private static CommandResult FindDuplicate(IReadOnlyList<ProductionPackage> existing, IReadOnlyList<ProductionPackage> added)
    {
        var names = existing.Select(package => package.ProductionPackageName).ToHashSet(StringComparer.Ordinal);
        var duplicateName = added.Select(package => package.ProductionPackageName).FirstOrDefault(name => !names.Add(name));
        if (duplicateName is not null)
        {
            return CommandResult.Failure(CommandError.InvalidInput, $"Package '{duplicateName}' already exists.");
        }

        var orderNumbers = existing.SelectMany(package => package.ManufacturingOrders).Select(order => order.OrderNo)
            .ToHashSet(StringComparer.Ordinal);
        var duplicateOrderNo = added.SelectMany(package => package.ManufacturingOrders).Select(order => order.OrderNo)
            .FirstOrDefault(orderNo => !orderNumbers.Add(orderNo));
        return duplicateOrderNo is null
            ? CommandResult.Success(string.Empty)
            : CommandResult.Failure(CommandError.InvalidInput, $"Order number '{duplicateOrderNo}' already exists.");
    }

    private static CommandResult Validate(CreateProductionPackageRequest? request)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.PackageName))
        {
            return CommandResult.Failure(CommandError.InvalidInput, "A package name is required.");
        }

        if (request.DesiredQuantity < 1)
        {
            return CommandResult.Failure(CommandError.InvalidInput, "The desired quantity of a package must be at least 1.");
        }

        if (request.Positions is null || request.Positions.Count == 0)
        {
            return CommandResult.Failure(CommandError.InvalidInput, "At least one position is required.");
        }

        var invalid = request.Positions.Any(position =>
            position is null
            || string.IsNullOrWhiteSpace(position.OrderNo)
            || string.IsNullOrWhiteSpace(position.PartNo)
            || position.DesiredNumberOfParts < 1
            || position.DesiredNumberOfParts > MaxPartsPerPosition);
        return invalid
            ? CommandResult.Failure(CommandError.InvalidInput,
                $"Each position needs an order number, a part number and a desired quantity from 1 to {MaxPartsPerPosition}.")
            : CommandResult.Success(string.Empty);
    }

    private static CommandResult Validate(GenerateDatasetRequest? request)
    {
        if (request is null
            || request.PackageCount < 1 || request.PackageCount > MaxGeneratedPackages
            || request.PositionsPerPackage < 1 || request.PositionsPerPackage > MaxGeneratedPositionsPerPackage)
        {
            return CommandResult.Failure(CommandError.InvalidInput,
                $"Packages 1-{MaxGeneratedPackages}, positions per package 1-{MaxGeneratedPositionsPerPackage}.");
        }

        if (request.MinimumPartsPerPosition < 1
            || request.MaximumPartsPerPosition > MaxPartsPerPosition
            || request.MinimumPartsPerPosition > request.MaximumPartsPerPosition)
        {
            return CommandResult.Failure(CommandError.InvalidInput,
                $"Parts per position: 1 <= minimum <= maximum <= {MaxPartsPerPosition}.");
        }

        return CommandResult.Success(string.Empty);
    }

    private static ProductionPackageDto ToDto(ProductionPackage package)
    {
        var positions = package.ManufacturingOrders
            .Select(order => new ProductionPackagePositionDto(
                order.OrderNo, order.PartNo, order.DesiredNumberOfParts, order.ProcessedParts, order.Status.ToString()))
            .ToArray();
        return new ProductionPackageDto(
            package.ProductionPackageName, package.DesiredQuantity, package.ProcessedQuantity, package.ReportedBy, positions);
    }
}
