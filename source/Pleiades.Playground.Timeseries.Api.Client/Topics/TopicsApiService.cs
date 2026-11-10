using System.Text.Json;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client;

public class TopicsApiService(HttpClient httpClient) : ITopicsService
{
    private readonly HttpClient httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
    private static readonly JsonSerializerOptions JsonSerializerOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    public async Task<TopicsDto> FindTopicsByTimeRange(DateTime startTime, DateTime stopTime, CancellationToken cancellationToken = default)
    {
        var url = $"topics?startTime={Uri.EscapeDataString(startTime.ToString("o", null))}&stopTime={Uri.EscapeDataString(stopTime.ToString("o", null))}";
        var response = await httpClient.GetAsync(new Uri(url, UriKind.Relative), cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        var stringResult = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        return JsonSerializer.Deserialize<TopicsDto>(stringResult, JsonSerializerOptions)
            ?? throw new InvalidOperationException("Deserialization resulted in null.");
    }
}
