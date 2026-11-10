namespace Pleiades.Playground.Timeseries.Common.Exceptions;

public class PleiadesReadException : Exception
{
    public string? Query { get; set; }

    public PleiadesReadException()
    {
    }

    public PleiadesReadException(string? message) : base(message)
    {
    }

    public PleiadesReadException(string? message, Exception? innerException) : base(message, innerException)
    {
    }

    public PleiadesReadException(string? message, Exception? innerException, string? query) : base(message, innerException)
    {
        Query = query;
    }
}
