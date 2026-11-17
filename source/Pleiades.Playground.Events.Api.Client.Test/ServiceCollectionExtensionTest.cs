using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Pleiades.Playground.Events.Api.Client.NotificationEvents;
using Pleiades.Playground.Events.Api.Client.ProductionEvents;

namespace Pleiades.Playground.Events.Api.Client.Test;

[TestClass]
public class ServiceCollectionExtensionTest
{
    [TestMethod]
    public void ConfigureNotificationEventsClientTest()
    {
        // Arrange
        var serviceCollection = new ServiceCollection();

        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(
                new Dictionary<string, string?>{
                        { "TestKey:Uri", "https://test-events-api/" }
                }
             )
            .Build();

        // Act
        serviceCollection.AddEventsApiService<INotificationEventService, NotificationEventApiService>(configuration.GetSection("TestKey"));

        var serviceProvider = serviceCollection.BuildServiceProvider();
        var notificationEventService = serviceProvider.GetService<INotificationEventService>();

        // Assert
        Assert.IsNotNull(notificationEventService);
        Assert.IsInstanceOfType(notificationEventService, typeof(NotificationEventApiService));
    }

    [TestMethod]
    public void ConfigureProductionEventsClientTest()
    {
        var serviceCollection = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { { "TestKey:Uri", "https://test-events-api/" } })
            .Build();

        serviceCollection.AddEventsApiService<IProductionEventService, ProductionEventApiService>(configuration.GetSection("TestKey"));

        var service = serviceCollection.BuildServiceProvider().GetService<IProductionEventService>();
        Assert.IsInstanceOfType<ProductionEventApiService>(service);
    }
}
