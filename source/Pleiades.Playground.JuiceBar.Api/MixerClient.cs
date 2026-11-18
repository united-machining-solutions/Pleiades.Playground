using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.JuiceBar.Api;

/// <summary>
/// The REST interface of MixerControl, as far as this service uses it. Of its routes that change something it
/// calls exactly one: the one that places an order. It never starts the production and never touches a pump.
/// </summary>
internal sealed class MixerClient(IHttpClientFactory clients, IOptions<JuiceBarOptions> options)
{
    internal const string HttpClientName = "juicebar";

    internal async Task<IReadOnlyList<Drink>> DrinksAsync(CancellationToken cancellationToken)
    {
        using var document = await GetAsync("api/drinks", cancellationToken).ConfigureAwait(false);
        return document is { RootElement.ValueKind: JsonValueKind.Array }
            ? [.. document.RootElement.EnumerateArray().Select(ToDrink).OfType<Drink>()]
            : throw new JuiceBarUnavailableException("The juice bar returned no list of drinks.");
    }

    internal async Task<Drink?> DrinkAsync(string id, CancellationToken cancellationToken)
    {
        // The machine answers an unknown id with an error of its marketplace, so the card decides what exists.
        var drinks = await DrinksAsync(cancellationToken).ConfigureAwait(false);
        return drinks.FirstOrDefault(d => string.Equals(d.Id, id, StringComparison.OrdinalIgnoreCase));
    }

    internal async Task<IReadOnlyList<Pump>> PumpsAsync(IReadOnlyDictionary<int, bool> warnings, CancellationToken cancellationToken)
    {
        using var pumps = await GetAsync("api/admin/pumps", cancellationToken).ConfigureAwait(false);
        using var amounts = await GetAsync("api/admin/pumps/standardAmount", cancellationToken).ConfigureAwait(false);
        using var components = await ComponentsAsync(cancellationToken).ConfigureAwait(false);
        if (pumps is not { RootElement.ValueKind: JsonValueKind.Array })
        {
            throw new JuiceBarUnavailableException("The juice bar returned no list of pumps.");
        }

        var names = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        if (components is { RootElement.ValueKind: JsonValueKind.Object }
            && components.RootElement.TryGetProperty("available", out var available) && available.ValueKind == JsonValueKind.Array)
        {
            foreach (var component in available.EnumerateArray())
            {
                if (Text(component, "id") is { } id)
                {
                    names[id] = Text(component, "name");
                }
            }
        }

        var result = new List<Pump>();
        foreach (var pump in pumps.RootElement.EnumerateArray())
        {
            if (LiveState.Number(pump, "nr") is not { } number)
            {
                continue;
            }

            var componentId = Text(pump, "componentId");
            // The machine keeps the size of a bottle in millilitre.
            double? volume = amounts is { RootElement.ValueKind: JsonValueKind.Object }
                && amounts.RootElement.TryGetProperty(number.ToString(CultureInfo.InvariantCulture), out var amount)
                && amount.ValueKind == JsonValueKind.Number && amount.TryGetDouble(out var millilitre) && millilitre >= 0
                    ? millilitre * 1e-6
                    : null;
            result.Add(new(number, componentId, componentId is null ? null : names.GetValueOrDefault(componentId), volume,
                warnings.TryGetValue(number, out var warning) ? warning : null));
        }

        return result;
    }

    // The machine takes the names of the ingredients from its marketplace. While that is away, the pumps are
    // still known, without names.
    private async Task<JsonDocument?> ComponentsAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await GetAsync("api/components", cancellationToken).ConfigureAwait(false);
        }
        catch (JuiceBarUnavailableException)
        {
            return null;
        }
    }

    /// <summary>Reads an order, or null when the machine does not know the number.</summary>
    internal async Task<Order?> OrderAsync(int orderNumber, CancellationToken cancellationToken)
    {
        using var document = await GetAsync("api/orders/" + orderNumber.ToString(CultureInfo.InvariantCulture), cancellationToken)
            .ConfigureAwait(false);
        return document is null ? null : ToOrder(document.RootElement);
    }

    /// <summary>Places an order. Sent once: a failed request is never repeated, so no drink is ordered twice.</summary>
    internal async Task<Order> CreateOrderAsync(string drinkId, CancellationToken cancellationToken)
    {
        using var client = clients.CreateClient(HttpClientName);
        try
        {
            using var response = await client.PostAsJsonAsync(new Uri("api/orders", UriKind.Relative), new { drinkId }, cancellationToken)
                .ConfigureAwait(false);
            if (response.StatusCode != HttpStatusCode.Created)
            {
                throw new JuiceBarUnavailableException(
                    $"The juice bar refused the order (HTTP {(int)response.StatusCode}). It was not placed.");
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            return ToOrder(document.RootElement)
                ?? throw new JuiceBarUnavailableException("The juice bar accepted the order and returned no order number.");
        }
        catch (Exception error) when (error is HttpRequestException or JsonException
            || (error is OperationCanceledException && !cancellationToken.IsCancellationRequested))
        {
            throw new JuiceBarUnavailableException(
                "The juice bar did not answer the order. Whether it was placed is unknown: read the status before ordering again.", error);
        }
    }

    /// <summary>GET of a JSON document. Null for 404.</summary>
    private async Task<JsonDocument?> GetAsync(string path, CancellationToken cancellationToken)
    {
        using var client = clients.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(path, UriKind.Relative));
        // The machine takes the language of its names from this cookie.
        request.Headers.Add("Cookie", "language=" + (options.Value.Language == "de" ? "de" : "en"));
        try
        {
            using var response = await client.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }

            if (!response.IsSuccessStatusCode)
            {
                throw new JuiceBarUnavailableException($"The juice bar answered with HTTP {(int)response.StatusCode}.");
            }

            return JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
        }
        catch (Exception error) when (error is HttpRequestException or JsonException
            || (error is OperationCanceledException && !cancellationToken.IsCancellationRequested))
        {
            throw new JuiceBarUnavailableException("The juice bar is not reachable or gave an unreadable answer.", error);
        }
    }

    private static Drink? ToDrink(JsonElement drink)
    {
        if (Text(drink, "id") is not { } id || Text(drink, "title") is not { } title)
        {
            return null;
        }

        var components = drink.TryGetProperty("components", out var list) && list.ValueKind == JsonValueKind.Array
            ? list.EnumerateArray().Where(c => Text(c, "id") is not null).Select(c => new DrinkComponent(Text(c, "id")!, Text(c, "name"))).ToArray()
            : [];
        return new(id, title, Text(drink, "description"), components);
    }

    private static Order? ToOrder(JsonElement order)
        => LiveState.Number(order, "orderNumber") is { } number
            ? new(number, Text(order, "orderName"), Text(order, "drinkId"), null, null, null, Text(order, "errorMessage"))
            : null;

    private static string? Text(JsonElement value, string property)
        => value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element)
            ? LiveState.Text(element)
            : null;
}
