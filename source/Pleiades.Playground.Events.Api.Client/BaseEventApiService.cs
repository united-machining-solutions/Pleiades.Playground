using System.Net.Http.Json;
using System.Text.Json;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Events.Api.Client.Exceptions;

namespace Pleiades.Playground.Events.Api.Client;

public abstract class BaseEventApiService(HttpClient httpClient)
{
    private readonly HttpClient _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
    private static readonly JsonSerializerOptions JsonOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    protected async Task<T> ExecuteGetRequestAsync<T>(string relativePath)
    {
        return await ExecuteGetRequestAsync<T>(relativePath, CancellationToken.None).ConfigureAwait(false);
    }

    protected async Task<T> ExecuteGetRequestAsync<T>(string relativePath, CancellationToken cancellationToken)
    {
        try
        {
            var uri = new Uri(relativePath, UriKind.Relative);
            var response = await _httpClient.GetAsync(uri, cancellationToken).ConfigureAwait(false);
            if (response.IsSuccessStatusCode)
            {
                var stringResult = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                return JsonSerializer.Deserialize<T>(stringResult, JsonOptions)
                    ?? throw new InvalidOperationException("Deserialization resulted in null.");
            }

            throw new PleiadesEventPersistenceException($"{response.StatusCode} - HTTP GET request failed: {relativePath}");
        }
        catch (HttpRequestException ex)
        {
            throw new PleiadesEventPersistenceException("Error executing HTTP GET request.", ex);
        }
    }

    protected async Task<T> PostAsync<T>(string relativePath, object dto)
    {
        using var content = JsonContent.Create(dto, options: JsonOptions);
        var uri = new Uri(relativePath, UriKind.Relative);
        var response = await _httpClient.PostAsync(uri, content).ConfigureAwait(false);
        if (response.IsSuccessStatusCode)
        {
            var stringResult = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return JsonSerializer.Deserialize<T>(stringResult, JsonOptions)
                ?? throw new InvalidOperationException("Deserialization resulted in null.");
        }
        else
        {
            throw new PleiadesEventPersistenceException($"{response.StatusCode} - writing to db failed: {response.Content}");
        }
    }

    protected async Task PostAsync(string relativePath, object dto)
    {
        await PostAsync(relativePath, dto, CancellationToken.None).ConfigureAwait(false);
    }

    protected async Task PostAsync(string relativePath, object dto, CancellationToken cancellationToken)
    {
        using var content = JsonContent.Create(dto, options: JsonOptions);
        var uri = new Uri(relativePath, UriKind.Relative);
        var response = await _httpClient.PostAsync(uri, content, cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new PleiadesEventPersistenceException($"{response.StatusCode} - writing to db failed: {response.Content}");
        }
    }
}
