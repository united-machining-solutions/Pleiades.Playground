using System.Text.Json.Serialization;


namespace Pleiades.Playground.Common.DataTransferObjects.DataTypes;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum ChannelType
{
    /// <summary>
    /// Channel stores start timestamp and equidistant data values with given frequency
    /// </summary>
    EquidistantTimeDomain,

    /// <summary>
    /// Channel stores value data points <double> and corresponding timestamps
    /// </summary>
    TimeDomainDouble,

    /// <summary>
    /// Channel stores value data points <bool> and corresponding timestamps
    /// </summary>
    TimeDomainBool,

    /// <summary>
    /// Channel stores value data points <string> and corresponding timestamps
    /// </summary>
    TimeDomainString,

    /// <summary>
    /// Channel stores data without domain, respectively this or other channel is a domain
    /// </summary>
    Domainless,
}
