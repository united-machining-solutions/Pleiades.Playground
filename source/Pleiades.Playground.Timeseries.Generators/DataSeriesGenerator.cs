using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Generators;

public class DataSeriesGenerator
{
    private readonly string _baseTopic;
    private DateTime _currentTime;
    private readonly Random _random;

    public DataSeriesGenerator(DateTime startTime, string baseTopic)
    {
        _currentTime = startTime;
        _random = new Random();
        _baseTopic = baseTopic;
    }

    [System.Diagnostics.CodeAnalysis.SuppressMessage("Major Code Smell", "CA5394:Use cryptographically secure random number generators when randomness is required for security", Justification = "Only for generating sample data")]
    public Dictionary<string, BaseUnitSeriesRequestDto> GenerateDataSeries(int numberOfTopics, int dataPointsPerSeries, TimeSpan samplingFrequency)
    {
        var dataSeriesDictionary = new Dictionary<string, BaseUnitSeriesRequestDto>();

        for (int topicIndex = 0; topicIndex < numberOfTopics; topicIndex++)
        {
            var topic = $"{_baseTopic}{topicIndex}";
            var dataPoints = new List<DataPointDto<double>>();

            for (int pointIndex = 0; pointIndex < dataPointsPerSeries; pointIndex++)
            {
                var dataPoint = new DataPointDto<double>
                {
                    Timestamp = _currentTime + pointIndex * samplingFrequency,
                    Value = _random.NextDouble()
                };
                dataPoints.Add(dataPoint);
            }

            dataSeriesDictionary.Add(topic, new BaseUnitSeriesRequestDto
            {
                DataPoints = dataPoints
            });
        }

        _currentTime += (dataPointsPerSeries + 10) * samplingFrequency;

        return dataSeriesDictionary;
    }
}
