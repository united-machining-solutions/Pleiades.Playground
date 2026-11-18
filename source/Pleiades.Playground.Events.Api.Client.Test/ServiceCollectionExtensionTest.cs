// SPDX-License-Identifier: Apache-2.0
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Pleiades.Playground.Events.Api.Client.MachineEvents;

namespace Pleiades.Playground.Events.Api.Client.Test;

[TestClass]
public class ServiceCollectionExtensionTest
{
    [TestMethod]
    public void ConfigureMachineEventsClientTest()
    {
        var serviceCollection = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { { "TestKey:Uri", "https://test-events-api/" } })
            .Build();

        serviceCollection.AddEventsApiService<IMachineEventService, MachineEventApiService>(configuration.GetSection("TestKey"));

        Assert.IsInstanceOfType<MachineEventApiService>(serviceCollection.BuildServiceProvider().GetService<IMachineEventService>());
    }
}
