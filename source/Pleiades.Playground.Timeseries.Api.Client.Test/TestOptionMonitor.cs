using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace Pleiades.Playground.Timeseries.Api.Client.Test;

public class TestOptionsMonitor<T> : IOptionsMonitor<T>
{
    private readonly IConfigurationSection _configurationSection;

    // For tests we treat the unnamed (CurrentValue) as the base section itself
    public T CurrentValue => _configurationSection.Get<T>()!;

    public TestOptionsMonitor(IConfigurationSection configurationSection)
    {
        ArgumentNullException.ThrowIfNull(configurationSection);

        _configurationSection = configurationSection;
    }

    public T Get(string? name)
    {
        ArgumentNullException.ThrowIfNull(name);
        var key = name.Replace("Api", "", StringComparison.Ordinal).Replace("Service", "", StringComparison.Ordinal);
        var section = _configurationSection.GetSection(key);
        return section.Get<T>() ?? throw new KeyNotFoundException(name);
    }

    public IDisposable OnChange(Action<T, string> listener)
    {
        throw new NotImplementedException();
    }
}
