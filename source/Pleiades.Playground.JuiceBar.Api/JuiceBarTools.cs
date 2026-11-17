using System.ComponentModel;
using Microsoft.AspNetCore.Authorization;
using ModelContextProtocol;
using ModelContextProtocol.Server;

namespace Pleiades.Playground.JuiceBar.Api;

[McpServerToolType]
internal sealed class JuiceBarTools(JuiceBarService juiceBar)
{
    [McpServerTool(Name = "juicebar_drinks_list", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("List the drinks the juice bar can mix now, each with its id, title, description and ingredients. Only drinks whose ingredients are installed are listed.")]
    public Task<IReadOnlyList<Drink>> Drinks(CancellationToken cancellationToken)
        => Guard(() => juiceBar.DrinksAsync(cancellationToken));

    [McpServerTool(Name = "juicebar_drink_get", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Get one drink of the card by its id.")]
    public Task<Drink> Drink([Description("Id of the drink, from juicebar_drinks_list.")] string drinkId,
        CancellationToken cancellationToken)
        => Guard(() => juiceBar.DrinkAsync(drinkId, cancellationToken));

    [McpServerTool(Name = "juicebar_status", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Read the state of the juice bar: whether it is connected, the production state, progress as a fraction 0-1, the waiting orders, and each pump with its ingredient, bottle volume in cubic metre and whether it warns that the bottle runs low. There is no measured fill level.")]
    public Task<JuiceBarStatus> Status(CancellationToken cancellationToken)
        => Guard(() => juiceBar.StatusAsync(cancellationToken));

    [McpServerTool(Name = "juicebar_order_get", ReadOnly = true, Idempotent = true, Destructive = false),
     Description("Get one order by its number: its drink, its state, progress as a fraction 0-1 and its place in the queue.")]
    public Task<Order> Order([Description("Number of the order, from juicebar_order_create.")] int orderNumber,
        CancellationToken cancellationToken)
        => Guard(() => juiceBar.OrderAsync(orderNumber, cancellationToken));

    [Authorize(Policy = "juicebar:write")]
    [McpServerTool(Name = "juicebar_order_create", ReadOnly = false, Idempotent = false, Destructive = false),
     Description("Order one drink at the real machine. Call it only when a person asked for that drink. The order joins the queue and cannot be cancelled; a person then puts a glass under the outlet and presses the start button. Refused while the queue is full or the machine is not ready. Never repeat a failed call without reading juicebar_status first.")]
    public Task<Order> CreateOrder([Description("Id of the drink, from juicebar_drinks_list.")] string drinkId,
        CancellationToken cancellationToken)
        => Guard(() => juiceBar.CreateOrderAsync(drinkId, cancellationToken));

    // A tool answers a refusal in words the model can act on, instead of an unnamed failure.
    private static async Task<T> Guard<T>(Func<Task<T>> call)
    {
        try
        {
            return await call().ConfigureAwait(false);
        }
        catch (Exception error) when (error is ArgumentException or KeyNotFoundException or InvalidOperationException
            or JuiceBarUnavailableException)
        {
            throw new McpException(error.Message, error);
        }
    }
}
