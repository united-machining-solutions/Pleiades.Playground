namespace Pleiades.Playground.Common.Exceptions;

public class PleiadesDuplicateDataException : Exception
{
    public PleiadesDuplicateDataException()
    {
    }

    public PleiadesDuplicateDataException(string? message) : base(message)
    {
    }

    public PleiadesDuplicateDataException(string? message, Exception? innerException) : base(message, innerException)
    {
    }
}
