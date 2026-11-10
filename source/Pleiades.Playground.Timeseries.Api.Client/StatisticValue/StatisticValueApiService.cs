using System.Net.Http.Json;
using System.Text.Json;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Client.StatisticValue;

public class StatisticValueApiService(HttpClient httpClient) : IStatisticValueService
{
    private readonly HttpClient httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
    private static readonly JsonSerializerOptions JsonSerializerOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    public async Task<Dictionary<string, StatisticValueDtoV1>> GetStatisticValuesByTopicAndTimeRanges(string topic, List<TimeRangeDtoV1> timeWindows, CancellationToken cancellationToken = default)
    {
        using var content = JsonContent.Create(timeWindows, options: JsonSerializerOptions);

        var response = await httpClient.PostAsync(new Uri($"statistics/baseUnitValues/topics/{Uri.EscapeDataString(topic)}", UriKind.Relative), content, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        var stringResult = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        return JsonSerializer.Deserialize<Dictionary<string, StatisticValueDtoV1>>(stringResult, JsonSerializerOptions)
            ?? throw new InvalidOperationException("Deserialization resulted in null.");
    }
}
