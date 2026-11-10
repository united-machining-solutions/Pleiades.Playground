using System.Net.Http.Json;
using System.Text.Json;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Common.Pagination;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client.StringValue;

public class StringValueApiService(HttpClient httpClient) : IStringValueService
{
    private readonly HttpClient httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
    private static readonly JsonSerializerOptions JsonSerializerOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    public async Task<TimeseriesInsertResultDto> PostStringValues(Dictionary<string, StringSeriesRequestDto> stringValues, CancellationToken cancellationToken = default)
    {
        using var content = JsonContent.Create(stringValues, options: JsonSerializerOptions);

        var response = await httpClient.PostAsync(new Uri("timeseries/stringValues", UriKind.Relative), content, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        var stringResult = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        return JsonSerializer.Deserialize<TimeseriesInsertResultDto>(stringResult, JsonSerializerOptions)
            ?? throw new InvalidOperationException("Deserialization resulted in null.");
    }

    public async Task<StringSeriesResponseDto> FindStringValuesByTopicAndTimeRange(string topic, DateTime startTime, DateTime stopTime, long limit, Sorting sorting, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(topic);

        var url = $"timeseries/stringValues/topics/{Uri.EscapeDataString(topic)}?startTime={Uri.EscapeDataString(startTime.ToString("o", null))}&stopTime={Uri.EscapeDataString(stopTime.ToString("o", null))}&limit={limit}&sorting={sorting}";

        var response = await httpClient.GetAsync(new Uri(url, UriKind.Relative), cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        var stringResult = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        return JsonSerializer.Deserialize<StringSeriesResponseDto>(stringResult, JsonSerializerOptions)
            ?? throw new InvalidOperationException("Deserialization resulted in null.");
    }
}
