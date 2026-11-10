namespace Pleiades.Playground.Timeseries.Common.Exceptions;

public class PleiadesWriteException : Exception
{
    public PleiadesWriteException()
    {
    }

    public PleiadesWriteException(string? message) : base(message)
    {
    }

    public PleiadesWriteException(string? message, Exception? innerException) : base(message, innerException)
    {
    }
}
