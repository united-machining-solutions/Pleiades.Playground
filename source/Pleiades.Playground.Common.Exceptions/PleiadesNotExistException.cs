namespace Pleiades.Playground.Common.Exceptions;

public class PleiadesNotExistException : Exception
{
    public PleiadesNotExistException()
    {
    }

    public PleiadesNotExistException(string? message) : base(message)
    {
    }

    public PleiadesNotExistException(string? message, Exception? innerException) : base(message, innerException)
    {
    }
}
