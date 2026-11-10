using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using Pleiades.Playground.Common.Pagination;

namespace Pleiades.Playground.Timeseries.Api.Utils;

internal sealed class QueryParameterUtils : IQueryParameterUtils
{
    private readonly QueryLimitsSettings _settings;

    public QueryParameterUtils(IOptions<QueryLimitsSettings> options)
    {
        ArgumentNullException.ThrowIfNull(options);
        _settings = options.Value;
    }

    public (long actualLimit, TimeSpan timeout, Sorting actualSorting, BadRequest<string>? validationResult) ProcessQueryParameters(long? limit, TimeSpan? timeout, Sorting? sorting)
    {
        var actualSorting = sorting ?? Sorting.Ascending;
        var requestedLimit = limit ?? _settings.DefaultLimit;
        var requestedTimeout = timeout ?? _settings.DefaultTimeout;

        BadRequest<string>? validationResult = null;
        if (requestedLimit < 1 || requestedLimit > _settings.MaxLimit)
        {
            validationResult = TypedResults.BadRequest($"limit must be between 1 and {_settings.MaxLimit}.");
        }
        else if (requestedTimeout <= TimeSpan.Zero || requestedTimeout > _settings.MaxTimeout)
        {
            validationResult = TypedResults.BadRequest($"timeout must be between 00:00:01 and {_settings.MaxTimeout}.");
        }

        // Clamp to safe bounds so callers that ignore the validation result (e.g. MCP tools, which
        // cannot surface a BadRequest) still operate within the configured limits.
        var actualLimit = Math.Clamp(requestedLimit, 1L, _settings.MaxLimit);
        var actualTimeout = ClampTimeout(requestedTimeout);

        return (actualLimit, actualTimeout, actualSorting, validationResult);
    }

    private TimeSpan ClampTimeout(TimeSpan requestedTimeout)
    {
        if (requestedTimeout <= TimeSpan.Zero)
        {
            return _settings.DefaultTimeout;
        }

        return requestedTimeout > _settings.MaxTimeout ? _settings.MaxTimeout : requestedTimeout;
    }
}
