using Microsoft.AspNetCore.Http.HttpResults;
using Pleiades.Playground.Common.Pagination;

namespace Pleiades.Playground.Timeseries.Api.Utils;

/// <summary>
/// Resolves and validates the standard query parameters (limit, timeout, sorting) shared by the
/// timeseries endpoints.
/// </summary>
internal interface IQueryParameterUtils
{
    /// <summary>
    /// Applies defaults, validates the caller-supplied <paramref name="limit"/> and
    /// <paramref name="timeout"/> against the configured upper bounds, and clamps the returned values
    /// to those bounds.
    /// </summary>
    /// <param name="limit">Requested maximum number of data points, or <c>null</c> for the default.</param>
    /// <param name="timeout">Requested query timeout, or <c>null</c> for the default.</param>
    /// <param name="sorting">Requested sort order, or <c>null</c> for ascending.</param>
    /// <returns>
    /// The resolved (and clamped) values plus a <see cref="BadRequest{T}"/> when a supplied value
    /// exceeded its bound (callers that cannot surface it may ignore it and use the clamped values).
    /// </returns>
    (long actualLimit, TimeSpan timeout, Sorting actualSorting, BadRequest<string>? validationResult) ProcessQueryParameters(long? limit, TimeSpan? timeout, Sorting? sorting);
}
