using Pleiades.Playground.Timeseries.Api.Services.Downsampling;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Test.UnitTests;

/// <summary>
/// Unit tests for the backend-agnostic downsampling helpers: LTTB for numeric series and
/// every-nth subsampling for string/boolean series, plus the <c>OriginalCount</c>/<c>Downsampled</c>
/// metadata contract.
/// </summary>
[TestClass]
public class TimeseriesDownsamplerTests
{
    private const string Topic = "t";
    private static readonly DateTime Origin = new(2024, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private static Dictionary<string, BaseUnitSeriesRequestDto> MakeBaseUnit(int count)
    {
        var dto = new BaseUnitSeriesRequestDto();
        for (var i = 0; i < count; i++)
        {
            dto.DataPoints.Add(new DataPointDto<double> { Timestamp = Origin.AddMinutes(i), Value = i });
        }

        return new Dictionary<string, BaseUnitSeriesRequestDto> { [Topic] = dto };
    }

    private static Dictionary<string, StringSeriesRequestDto> MakeString(int count)
    {
        var dto = new StringSeriesRequestDto();
        for (var i = 0; i < count; i++)
        {
            dto.DataPoints.Add(new DataPointDto<string> { Timestamp = Origin.AddMinutes(i), Value = $"v{i}" });
        }

        return new Dictionary<string, StringSeriesRequestDto> { [Topic] = dto };
    }

    private static Dictionary<string, BooleanSeriesRequestDto> MakeBoolean(int count)
    {
        var dto = new BooleanSeriesRequestDto();
        for (var i = 0; i < count; i++)
        {
            dto.DataPoints.Add(new DataPointDto<bool> { Timestamp = Origin.AddMinutes(i), Value = i % 2 == 0 });
        }

        return new Dictionary<string, BooleanSeriesRequestDto> { [Topic] = dto };
    }

    #region BaseUnit (LTTB)

    [TestMethod]
    public void ApplyBaseUnitDownsamplingMetadata_WithinLimit_LeavesDataAndTagsNotDownsampled()
    {
        // Arrange
        var data = MakeBaseUnit(5);

        // Act
        TimeseriesDownsampler.ApplyBaseUnitDownsamplingMetadata(data, limit: 10, downsampleRequested: true);

        // Assert
        var series = data[Topic];
        Assert.HasCount(5, series.DataPoints);
        Assert.AreEqual(5, series.OriginalCount);
        Assert.IsFalse(series.Downsampled);
    }

    [TestMethod]
    public void ApplyBaseUnitDownsamplingMetadata_OverLimit_ReducesButKeepsFirstAndLastPoint()
    {
        // Arrange
        var data = MakeBaseUnit(100);
        var firstTimestamp = data[Topic].DataPoints[0].Timestamp;
        var lastTimestamp = data[Topic].DataPoints[^1].Timestamp;

        // Act
        TimeseriesDownsampler.ApplyBaseUnitDownsamplingMetadata(data, limit: 10, downsampleRequested: true);

        // Assert
        var series = data[Topic];
        Assert.IsLessThanOrEqualTo(10, series.DataPoints.Count, "result must not exceed the requested limit");
        Assert.IsLessThan(100, series.DataPoints.Count, "result must actually be reduced");
        Assert.AreEqual(firstTimestamp, series.DataPoints[0].Timestamp);
        Assert.AreEqual(lastTimestamp, series.DataPoints[^1].Timestamp);
        Assert.AreEqual(100, series.OriginalCount);
        Assert.IsTrue(series.Downsampled);
    }

    [TestMethod]
    public void ApplyBaseUnitDownsamplingMetadata_DownsampleDisabled_LeavesDataButRecordsOriginalCount()
    {
        // Arrange
        var data = MakeBaseUnit(100);

        // Act
        TimeseriesDownsampler.ApplyBaseUnitDownsamplingMetadata(data, limit: 10, downsampleRequested: false);

        // Assert
        var series = data[Topic];
        Assert.HasCount(100, series.DataPoints);
        Assert.AreEqual(100, series.OriginalCount);
        Assert.IsFalse(series.Downsampled);
    }

    [TestMethod]
    public void ApplyBaseUnitDownsamplingMetadata_LimitOfTwo_KeepsOnlyTheEndpoints()
    {
        // Arrange
        var data = MakeBaseUnit(10);
        var firstTimestamp = data[Topic].DataPoints[0].Timestamp;
        var lastTimestamp = data[Topic].DataPoints[^1].Timestamp;

        // Act
        TimeseriesDownsampler.ApplyBaseUnitDownsamplingMetadata(data, limit: 2, downsampleRequested: true);

        // Assert
        var series = data[Topic];
        Assert.HasCount(2, series.DataPoints);
        Assert.AreEqual(firstTimestamp, series.DataPoints[0].Timestamp);
        Assert.AreEqual(lastTimestamp, series.DataPoints[1].Timestamp);
        Assert.IsTrue(series.Downsampled);
    }

    [TestMethod]
    public void ApplyBaseUnitDownsamplingMetadata_EmptySeries_DoesNotThrow()
    {
        // Arrange
        var data = MakeBaseUnit(0);

        // Act
        TimeseriesDownsampler.ApplyBaseUnitDownsamplingMetadata(data, limit: 10, downsampleRequested: true);

        // Assert
        var series = data[Topic];
        Assert.IsEmpty(series.DataPoints);
        Assert.AreEqual(0, series.OriginalCount);
        Assert.IsFalse(series.Downsampled);
    }

    #endregion

    #region String (every-nth)

    [TestMethod]
    public void ApplyStringDownsamplingMetadata_WithinLimit_LeavesDataAndTagsNotDownsampled()
    {
        // Arrange
        var data = MakeString(5);

        // Act
        TimeseriesDownsampler.ApplyStringDownsamplingMetadata(data, limit: 10, downsampleRequested: true);

        // Assert
        var series = data[Topic];
        Assert.HasCount(5, series.DataPoints);
        Assert.AreEqual(5, series.OriginalCount);
        Assert.IsFalse(series.Downsampled);
    }

    [TestMethod]
    public void ApplyStringDownsamplingMetadata_OverLimit_ReducesButKeepsFirstAndLastValue()
    {
        // Arrange
        var data = MakeString(100);
        var firstValue = data[Topic].DataPoints[0].Value;
        var lastValue = data[Topic].DataPoints[^1].Value;

        // Act
        TimeseriesDownsampler.ApplyStringDownsamplingMetadata(data, limit: 10, downsampleRequested: true);

        // Assert
        var series = data[Topic];
        Assert.IsLessThanOrEqualTo(10, series.DataPoints.Count, "result must not exceed the requested limit");
        Assert.IsLessThan(100, series.DataPoints.Count, "result must actually be reduced");
        Assert.AreEqual(firstValue, series.DataPoints[0].Value);
        Assert.AreEqual(lastValue, series.DataPoints[^1].Value);
        Assert.AreEqual(100, series.OriginalCount);
        Assert.IsTrue(series.Downsampled);
    }

    [TestMethod]
    public void ApplyStringDownsamplingMetadata_DownsampleDisabled_LeavesData()
    {
        // Arrange
        var data = MakeString(100);

        // Act
        TimeseriesDownsampler.ApplyStringDownsamplingMetadata(data, limit: 10, downsampleRequested: false);

        // Assert
        var series = data[Topic];
        Assert.HasCount(100, series.DataPoints);
        Assert.AreEqual(100, series.OriginalCount);
        Assert.IsFalse(series.Downsampled);
    }

    #endregion

    #region Boolean (every-nth)

    [TestMethod]
    public void ApplyBooleanDownsamplingMetadata_OverLimit_ReducesButKeepsFirstAndLastPoint()
    {
        // Arrange
        var data = MakeBoolean(100);
        var firstTimestamp = data[Topic].DataPoints[0].Timestamp;
        var lastTimestamp = data[Topic].DataPoints[^1].Timestamp;

        // Act
        TimeseriesDownsampler.ApplyBooleanDownsamplingMetadata(data, limit: 10, downsampleRequested: true);

        // Assert
        var series = data[Topic];
        Assert.IsLessThanOrEqualTo(10, series.DataPoints.Count, "result must not exceed the requested limit");
        Assert.IsLessThan(100, series.DataPoints.Count, "result must actually be reduced");
        Assert.AreEqual(firstTimestamp, series.DataPoints[0].Timestamp);
        Assert.AreEqual(lastTimestamp, series.DataPoints[^1].Timestamp);
        Assert.AreEqual(100, series.OriginalCount);
        Assert.IsTrue(series.Downsampled);
    }

    #endregion
}
