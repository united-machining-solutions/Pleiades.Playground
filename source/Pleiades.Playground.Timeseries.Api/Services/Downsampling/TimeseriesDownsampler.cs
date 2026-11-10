using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Services.Downsampling;

/// <summary>
/// Backend-agnostic downsampling helpers used by every <see cref="ITimeseriesDbService"/>
/// implementation. Numeric series are reduced with the Largest-Triangle-Three-Buckets (LTTB)
/// algorithm; non-numeric series (string, boolean) use simple every-nth subsampling so that
/// transitions are preserved in order.
/// </summary>
internal static class TimeseriesDownsampler
{
    /// <summary>
    /// Applies LTTB to every numeric series and tags each result with original count and
    /// downsampling status.
    /// </summary>
    internal static void ApplyBaseUnitDownsamplingMetadata(
        Dictionary<string, BaseUnitSeriesRequestDto> result, long limit, bool downsampleRequested)
    {
        foreach (var series in result.Values)
        {
            var originalCount = series.DataPoints.Count;
            if (downsampleRequested)
            {
                LargestTriangleThreeBuckets(series.DataPoints, limit);
            }
            series.OriginalCount = originalCount;
            series.Downsampled = downsampleRequested && series.DataPoints.Count < originalCount;
        }
    }

    /// <summary>
    /// Applies every-nth subsampling to every string series.
    /// </summary>
    internal static void ApplyStringDownsamplingMetadata(
        Dictionary<string, StringSeriesRequestDto> result, long limit, bool downsampleRequested)
    {
        foreach (var series in result.Values)
        {
            var originalCount = series.DataPoints.Count;
            if (downsampleRequested)
            {
                EveryNthSample(series.DataPoints, limit);
            }
            series.OriginalCount = originalCount;
            series.Downsampled = downsampleRequested && series.DataPoints.Count < originalCount;
        }
    }

    /// <summary>
    /// Applies every-nth subsampling to every boolean series.
    /// </summary>
    internal static void ApplyBooleanDownsamplingMetadata(
        Dictionary<string, BooleanSeriesRequestDto> result, long limit, bool downsampleRequested)
    {
        foreach (var series in result.Values)
        {
            var originalCount = series.DataPoints.Count;
            if (downsampleRequested)
            {
                EveryNthSample(series.DataPoints, limit);
            }
            series.OriginalCount = originalCount;
            series.Downsampled = downsampleRequested && series.DataPoints.Count < originalCount;
        }
    }

    private static void LargestTriangleThreeBuckets(IList<DataPointDto<double>> dataPoints, long maxPoints)
    {
        var count = dataPoints.Count;
        if (count <= maxPoints)
        {
            return;
        }

        var sampled = new List<DataPointDto<double>>((int)maxPoints) { dataPoints[0] };
        var bucketSize = (double)(count - 2) / (maxPoints - 2);
        var previousSelectedIndex = 0;

        for (var bucketIndex = 0; bucketIndex < (int)maxPoints - 2; bucketIndex++)
        {
            var bucketStart = (int)((bucketIndex + 1) * bucketSize) + 1;
            var bucketEnd = Math.Min((int)((bucketIndex + 2) * bucketSize) + 1, count - 1);
            var nextBucketEnd = Math.Min((int)((bucketIndex + 3) * bucketSize) + 1, count - 1);

            var (avgTimeTicks, avgValue) = ComputeNextBucketAverage(dataPoints, bucketEnd, nextBucketEnd, count);
            var bestIndex = FindLargestTrianglePoint(dataPoints, bucketStart, bucketEnd, previousSelectedIndex, avgTimeTicks, avgValue);

            sampled.Add(dataPoints[bestIndex]);
            previousSelectedIndex = bestIndex;
        }

        if (previousSelectedIndex != count - 1)
        {
            sampled.Add(dataPoints[count - 1]);
        }

        dataPoints.Clear();
        foreach (var point in sampled)
        {
            dataPoints.Add(point);
        }
    }

    private static (double AvgTimeTicks, double AvgValue) ComputeNextBucketAverage(
        IList<DataPointDto<double>> dataPoints, int nextBucketStart, int nextBucketEnd, int totalCount)
    {
        var bucketCount = nextBucketEnd - nextBucketStart;
        if (bucketCount <= 0)
        {
            return (dataPoints[totalCount - 1].Timestamp.Ticks, dataPoints[totalCount - 1].Value);
        }

        double avgTimeTicks = 0;
        double avgValue = 0;
        for (var index = nextBucketStart; index < nextBucketEnd; index++)
        {
            avgTimeTicks += dataPoints[index].Timestamp.Ticks;
            avgValue += dataPoints[index].Value;
        }

        return (avgTimeTicks / bucketCount, avgValue / bucketCount);
    }

    private static int FindLargestTrianglePoint(
        IList<DataPointDto<double>> dataPoints, int bucketStart, int bucketEnd, int previousSelectedIndex,
        double avgTimeTicks, double avgValue)
    {
        var prevTimeTicks = (double)dataPoints[previousSelectedIndex].Timestamp.Ticks;
        var prevValue = dataPoints[previousSelectedIndex].Value;

        var bestIndex = bucketStart;
        double bestArea = -1;

        for (var index = bucketStart; index < bucketEnd; index++)
        {
            var area = Math.Abs(
                (prevTimeTicks - avgTimeTicks) * (dataPoints[index].Value - prevValue) -
                (prevTimeTicks - dataPoints[index].Timestamp.Ticks) * (avgValue - prevValue)
            ) * 0.5;

            if (area > bestArea)
            {
                bestArea = area;
                bestIndex = index;
            }
        }

        return bestIndex;
    }

    private static void EveryNthSample<T>(IList<DataPointDto<T>> dataPoints, long maxPoints)
    {
        if (dataPoints.Count <= maxPoints)
        {
            return;
        }

        var step = (double)dataPoints.Count / maxPoints;
        var sampled = new List<DataPointDto<T>>((int)maxPoints);

        for (double index = 0; index < dataPoints.Count && sampled.Count < (int)maxPoints - 1; index += step)
        {
            sampled.Add(dataPoints[(int)index]);
        }

        var lastPoint = dataPoints[dataPoints.Count - 1];
        if (sampled.Count == 0 || !ReferenceEquals(sampled[sampled.Count - 1], lastPoint))
        {
            sampled.Add(lastPoint);
        }

        dataPoints.Clear();
        foreach (var point in sampled)
        {
            dataPoints.Add(point);
        }
    }
}
