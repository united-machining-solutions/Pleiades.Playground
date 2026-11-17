using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Pleiades.Playground.Events.Api.Client.NotificationEvents;
using Pleiades.Playground.Events.Api.Client.JobEvents;
using Pleiades.Playground.Events.Api.Client.WorkMasterEvents;

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
    public void ConfigureJobAndWorkMasterEventsClientsTest()
    {
        var serviceCollection = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { { "TestKey:Uri", "https://test-events-api/" } })
            .Build();

        serviceCollection.AddEventsApiService<IJobEventService, JobEventApiService>(configuration.GetSection("TestKey"));
        serviceCollection.AddEventsApiService<IWorkMasterEventService, WorkMasterEventApiService>(configuration.GetSection("TestKey"));

        var provider = serviceCollection.BuildServiceProvider();
        Assert.IsInstanceOfType<JobEventApiService>(provider.GetService<IJobEventService>());
        Assert.IsInstanceOfType<WorkMasterEventApiService>(provider.GetService<IWorkMasterEventService>());
    }
}
