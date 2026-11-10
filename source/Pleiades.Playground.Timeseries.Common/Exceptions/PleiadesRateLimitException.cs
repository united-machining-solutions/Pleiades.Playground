namespace Pleiades.Playground.Timeseries.Common.Exceptions;

public class PleiadesRateLimitException : Exception
{
    public PleiadesRateLimitException()
    {
    }

    public PleiadesRateLimitException(string message) : base(message)
    {
    }

    public PleiadesRateLimitException(string message, Exception innerException) : base(message, innerException)
    {
    }
}
