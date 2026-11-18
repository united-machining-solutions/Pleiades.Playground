using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.OpcUa.Adapter;

/// <summary>What became of the stored data of a removed machine.</summary>
/// <param name="ValuesDeleted">How many values the Timeseries API deleted, or null if it did not.</param>
/// <param name="EventsDeleted">How many events the Events API deleted, or null if it did not.</param>
/// <param name="Problems">Why a part of the data stays stored, one reason each. Empty if all of it is gone.</param>
internal sealed record DataDeletion(long? ValuesDeleted, long? EventsDeleted, IReadOnlyList<string> Problems);

/// <summary>
/// Deletes what a machine published from the stores of the stack, through their REST contracts, by the
/// machine id of its topics: its values (<c>DELETE /machines/{machineId}</c> of the Timeseries API) and its
/// events (<c>DELETE /machineEvents/machines/{machineId}</c> of the Events API). The adapter never
/// writes to a database itself.
/// </summary>
internal sealed class MachineDataEraser
{
    private readonly HttpClient _http;
    private readonly Config _config;

    /// <summary>Creates the eraser.</summary>
    public MachineDataEraser(HttpClient http, IOptions<Config> config)
    {
        ArgumentNullException.ThrowIfNull(config);
        _http = http ?? throw new ArgumentNullException(nameof(http));
        _config = config.Value;
    }

    /// <summary>Deletes the values and the events of a machine. A store that fails is named in the problems; the other is deleted all the same.</summary>
    public async Task<DataDeletion> DeleteAsync(string machineId, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(machineId);
        var machine = Uri.EscapeDataString(machineId);
        var problems = new List<string>();
        var values = await DeleteAsync(
            _config.TimeseriesApi?.Uri, $"machines/{machine}", "valuesCount", "Timeseries API", "Config:TimeseriesApi:Uri", "values", problems, cancellationToken).ConfigureAwait(false);
        var events = await DeleteAsync(
            _config.EventsApi?.Uri, $"machineEvents/machines/{machine}", "eventsCount", "Events API", "Config:EventsApi:Uri", "events", problems, cancellationToken).ConfigureAwait(false);
        return new DataDeletion(values, events, problems);
    }

    private async Task<long?> DeleteAsync(
        Uri? api, string path, string count, string name, string setting, string what, List<string> problems, CancellationToken cancellationToken)
    {
        if (api is null)
        {
            problems.Add($"The adapter knows no {name} ({setting}): the {what} of the machine stay stored.");
            return null;
        }

        try
        {
            using var response = await _http.DeleteAsync(new Uri(api, path), cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                problems.Add($"The {name} answered {(int)response.StatusCode}: the {what} of the machine stay stored.");
                return null;
            }

            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            using var document = JsonDocument.Parse(body);
            return document.RootElement.TryGetProperty(count, out var number) && number.TryGetInt64(out var deleted) ? deleted : 0;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException or JsonException)
        {
            problems.Add($"The {name} could not be reached ({exception.Message}): the {what} of the machine may stay stored.");
            return null;
        }
    }
}
