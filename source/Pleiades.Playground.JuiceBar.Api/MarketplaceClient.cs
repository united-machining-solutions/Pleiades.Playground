using System.Globalization;
using System.Net;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.JuiceBar.Api;

/// <summary>One line of the report of the marketplace: an ingredient by its name, and in how many sold drinks it was.</summary>
internal sealed record IngredientReport(string Name, int Drinks);

/// <summary>
/// The report of the marketplace over one span of time: the lines it could read, and whether it is complete. Complete
/// means the report had room left and every line it gave could be read: then an ingredient not in it was in no sold
/// drink. Otherwise the count of such an ingredient is not known.
/// </summary>
internal sealed record MarketplaceReport(IReadOnlyList<IngredientReport> Lines, bool Complete);

/// <summary>
/// The public report of the marketplace the machine takes its recipes from: how often each ingredient went into a
/// sold drink, over all machines of the marketplace. It counts drinks, not millilitres, and needs no sign-in. This
/// service only reads it.
/// </summary>
internal sealed class MarketplaceClient(IHttpClientFactory clients, IOptions<JuiceBarOptions> options)
{
    internal const string HttpClientName = "marketplace";

    /// <summary>The most lines the report gives: an ingredient below them is not in it.</summary>
    internal const int ReportLimit = 10;

    /// <summary>Whether a marketplace is named at all.</summary>
    internal bool Named => !string.IsNullOrWhiteSpace(options.Value.MarketplaceUrl);

    /// <summary>
    /// The ingredients used most between <paramref name="from"/> and <paramref name="to"/>, at most
    /// <see cref="ReportLimit"/>, by the names the marketplace gives them in the language of this service.
    /// </summary>
    internal async Task<MarketplaceReport> TopIngredientsAsync(DateTimeOffset from, DateTimeOffset to,
        CancellationToken cancellationToken)
    {
        if (!Named)
        {
            throw new InvalidOperationException("No marketplace is named for this juice bar (JUICEBAR_MARKETPLACE_URL), so its use is not known.");
        }

        var query = string.Create(CultureInfo.InvariantCulture,
            $"api/reports/components/top?from={Uri.EscapeDataString(Instant(from))}&to={Uri.EscapeDataString(Instant(to))}&limit={ReportLimit}");
        using var client = clients.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(query, UriKind.Relative));
        // The marketplace names the ingredients in the language of this cookie, as the machine does.
        request.Headers.Add("Cookie", "language=" + (options.Value.Language == "de" ? "de" : "en"));
        try
        {
            using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (response.StatusCode != HttpStatusCode.OK)
            {
                throw new JuiceBarUnavailableException($"The marketplace answered its report with HTTP {(int)response.StatusCode}.");
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            return ReportOf(document.RootElement);
        }
        catch (Exception error) when (error is HttpRequestException or JsonException
            || (error is OperationCanceledException && !cancellationToken.IsCancellationRequested))
        {
            throw new JuiceBarUnavailableException("The marketplace is not reachable or gave an unreadable report.", error);
        }
    }

    /// <summary>
    /// The lines of a report as the marketplace gives it. A line that cannot be read makes the report incomplete, since
    /// it may be the line of an ingredient on a pump.
    /// </summary>
    internal static MarketplaceReport ReportOf(JsonElement report)
    {
        if (report.ValueKind != JsonValueKind.Array)
        {
            throw new JuiceBarUnavailableException("The marketplace returned no list for its report.");
        }

        var lines = new List<IngredientReport>();
        var given = 0;
        foreach (var line in report.EnumerateArray())
        {
            given++;
            if (line.ValueKind == JsonValueKind.Object
                && line.TryGetProperty("componentname", out var name) && name.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(name.GetString())
                && line.TryGetProperty("amount", out var amount) && amount.ValueKind == JsonValueKind.Number
                && amount.TryGetInt32(out var drinks) && drinks >= 0)
            {
                lines.Add(new(name.GetString()!.Trim(), drinks));
            }
        }

        return new(lines, given < ReportLimit && lines.Count == given);
    }

    private static string Instant(DateTimeOffset at) => at.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
}
