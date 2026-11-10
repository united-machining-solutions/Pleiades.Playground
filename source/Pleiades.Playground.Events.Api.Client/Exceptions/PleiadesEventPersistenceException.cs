namespace Pleiades.Playground.Events.Api.Client.Exceptions;

public class PleiadesEventPersistenceException : Exception
{
    public PleiadesEventPersistenceException()
    {
    }

    public PleiadesEventPersistenceException(string? message) : base(message)
    {
    }

    public PleiadesEventPersistenceException(string? message, Exception? innerException) : base(message, innerException)
    {
    }
}
