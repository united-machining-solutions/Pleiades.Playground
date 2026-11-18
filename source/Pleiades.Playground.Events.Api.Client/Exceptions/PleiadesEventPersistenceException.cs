using System.Net;

namespace Pleiades.Playground.Events.Api.Client.Exceptions;

public class PleiadesEventPersistenceException : Exception
{
    /// <summary>The status the Events API answered with, or null where it gave no answer.</summary>
    public HttpStatusCode? StatusCode { get; init; }

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
