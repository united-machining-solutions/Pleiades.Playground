namespace Pleiades.Playground.Common.Pagination;

/// <summary>
/// Standard paginated response wrapper for API endpoints.
/// </summary>
/// <typeparam name="T">The type of items in the response.</typeparam>
/// <param name="Items">The items for the current page.</param>
/// <param name="TotalCount">Total number of items matching the query (across all pages).</param>
/// <param name="Skip">Number of items skipped (from request).</param>
/// <param name="Take">Maximum number of items requested (from request).</param>
public sealed record PagedResponse<T>(
    IReadOnlyList<T> Items,
    long TotalCount,
    int Skip,
    int Take)
{
    /// <summary>
    /// Indicates whether more items are available beyond this page.
    /// Clients should use this to determine if they need to fetch more data.
    /// </summary>
    public bool HasMore => Skip + Items.Count < TotalCount;

    /// <summary>
    /// The number of items returned in this page.
    /// </summary>
    public int Count => Items.Count;
}

/// <summary>
/// Factory methods for creating <see cref="PagedResponse{T}"/> instances.
/// </summary>
public static class PagedResponse
{
    /// <summary>
    /// Creates a <see cref="PagedResponse{T}"/> from query results.
    /// </summary>
    /// <typeparam name="T">The type of items in the response.</typeparam>
    /// <param name="items">The items for the current page.</param>
    /// <param name="totalCount">Total count of all matching items.</param>
    /// <param name="request">The pagination request parameters.</param>
    /// <returns>A new <see cref="PagedResponse{T}"/> instance.</returns>
    /// <exception cref="ArgumentNullException">Thrown when <paramref name="items"/> or <paramref name="request"/> is null.</exception>
    public static PagedResponse<T> Create<T>(IReadOnlyList<T> items, long totalCount, PagedRequest request)
    {
        ArgumentNullException.ThrowIfNull(items);
        ArgumentNullException.ThrowIfNull(request);
        return new PagedResponse<T>(items, totalCount, request.Skip, request.Take);
    }
}
