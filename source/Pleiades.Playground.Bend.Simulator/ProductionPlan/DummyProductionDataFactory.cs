using System.Diagnostics.CodeAnalysis;
using System.Globalization;
using Pleiades.Playground.Bend.Protocol.Model;

namespace Pleiades.Playground.Bend.Simulator.ProductionPlan;

/// <summary>
/// Makes production packages that go straight into the production plan, without a host having sent them.
/// </summary>
[SuppressMessage("Security", "CA5394:Do not use insecure randomness", Justification = "Test data, not security")]
internal sealed class DummyProductionDataFactory(Random random, TimeProvider time)
{
    private static readonly string[] PartNames =
    [
        "Angle", "Bracket", "CoverPlate", "HousingBase", "HousingLid", "SidePanel",
        "Console", "U-Profile", "Z-Profile", "Tab", "BackPanel", "Crossbar",
    ];

    /// <summary>The bending program of a part: its part number with the extension <c>.jupidu</c>.</summary>
    public static string ProgramNameFor(string partNo) => $"{partNo}.jupidu";

    /// <summary>A position with priority 5, status <see cref="RciOrderStatus.GUELTIG"/> and the bending program of its part.</summary>
    public static ManufacturingOrder CreatePosition(string orderNo, string partNo, int desiredNumberOfParts)
    {
        return new ManufacturingOrder
        {
            OrderNo = orderNo,
            PartNo = partNo,
            ProgramName = ProgramNameFor(partNo),
            DesiredNumberOfParts = desiredNumberOfParts,
            Priority = "5",
            Status = RciOrderStatus.GUELTIG,
        };
    }

    public static ProductionPackage CreatePackage(CreateProductionPackageRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return new ProductionPackage
        {
            ProductionPackageName = request.PackageName.Trim(),
            DesiredQuantity = request.DesiredQuantity,
            ManufacturingOrders = request.Positions
                .Select(position => CreatePosition(position.OrderNo.Trim(), position.PartNo.Trim(), position.DesiredNumberOfParts))
                .ToArray(),
        };
    }

    public IReadOnlyList<ProductionPackage> CreateDataset(GenerateDatasetRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        var prefix = string.IsNullOrWhiteSpace(request.NamePrefix) ? "SIM" : request.NamePrefix.Trim();
        var dataset = time.GetLocalNow().ToString("yyMMdd-HHmmss", CultureInfo.InvariantCulture);
        return Enumerable.Range(1, request.PackageCount)
            .Select(number => CreateGeneratedPackage(request, $"{prefix}-{dataset}-P{number:00}"))
            .ToArray();
    }

    private ProductionPackage CreateGeneratedPackage(GenerateDatasetRequest request, string packageName)
    {
        return new ProductionPackage
        {
            ProductionPackageName = packageName,
            DesiredQuantity = 1,
            ManufacturingOrders = Enumerable.Range(1, request.PositionsPerPackage)
                .Select(number => CreatePosition(
                    $"{packageName}-{number:00}",
                    RandomPartNo(),
                    random.Next(request.MinimumPartsPerPosition, request.MaximumPartsPerPosition + 1)))
                .ToArray(),
        };
    }

    private string RandomPartNo() => $"{PartNames[random.Next(PartNames.Length)]}-{random.Next(1000, 10000)}";
}
