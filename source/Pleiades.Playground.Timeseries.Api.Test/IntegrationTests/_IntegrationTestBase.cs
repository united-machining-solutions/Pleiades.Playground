using System.Globalization;
using System.Net.Http.Json;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Timeseries.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Api.Test.IntegrationTests;

[TestClass]
public class IntegrationTestBase
{
    private static readonly System.Text.Json.JsonSerializerOptions JsonOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    public bool Dummy { get; }

    public static bool Containerized { get; private set; }

    public static Uri BaseUrl { get; set; } = new("http://localhost/");

    public static Dictionary<string, BaseUnitSeriesRequestDto> TestBaseUnitValueModel { get; } = new Dictionary<string, BaseUnitSeriesRequestDto>
    {
        {
            "9000-0101/monitoring/axes/a1/state/feedRate",
            new BaseUnitSeriesRequestDto
            {
                DataPoints =
                [
                    new() {
                        Timestamp = DateTime.Parse("2024-10-28T08:22:23.353Z", CultureInfo.InvariantCulture),
                        Value = 0.0
                    }
                ]
            }
        }
    };

    public static Dictionary<string, StringSeriesRequestDto> TestStringValueModel { get; } = new Dictionary<string, StringSeriesRequestDto>
    {
        {
            "9000-0101/monitoring/axes/a1/state/feedRate",
            new StringSeriesRequestDto
            {
                DataPoints =
                [
                    new() {
                        Timestamp = DateTime.Parse("2024-10-28T08:22:23.353Z", CultureInfo.InvariantCulture),
                        Value = "TestValue"
                    }
                ]
            }
        }
    };

    [AssemblyInitialize]
    public static async Task IntegrationTestInitialize(TestContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        var baseUrl = Environment.GetEnvironmentVariable("TIMESERIESAPI_URL");

        if (baseUrl is null)
        {
            return;
        }

        Containerized = true;
        BaseUrl = new Uri(baseUrl);

        context.WriteLine("BaseUrl: {0}", baseUrl);

        // Seed through the production HTTP write path so the documents (and the topic_activity
        // companion collection) are populated exactly like in production.
        using var client = new HttpClient { BaseAddress = BaseUrl };

        var baseUnitResponse = await client
            .PostAsJsonAsync(new Uri("timeseries/baseUnitValues", UriKind.Relative), TestBaseUnitValueModel, JsonOptions, context.CancellationToken)
            .ConfigureAwait(false);
        baseUnitResponse.EnsureSuccessStatusCode();

        var stringResponse = await client
            .PostAsJsonAsync(new Uri("timeseries/stringValues", UriKind.Relative), TestStringValueModel, JsonOptions, context.CancellationToken)
            .ConfigureAwait(false);
        stringResponse.EnsureSuccessStatusCode();
    }

    [AssemblyCleanup]
    public static void IntegrationTestCleanup()
    {
        // No persistent client to dispose — the seed client is short-lived.
    }
}
