using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using MQTTnet.Client;
using MQTTnet.Extensions.ManagedClient;
using MQTTnet.Packets;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Timeseries.Api.Client.BaseUnitValue;
using Pleiades.Playground.Timeseries.Api.Client.BooleanValue;
using Pleiades.Playground.Timeseries.Api.Client.StringValue;
using Pleiades.Playground.HealthChecks.Mqtt;

namespace Pleiades.Playground.Timeseries.Persistence.Test;

/// <summary>
/// The <c>mqtt-subscription</c> entry follows the broker's answer, not the client's queue.
/// <c>SubscribeAsync</c> of the managed client returns at once, with no broker as well; only the SUBACK
/// on <c>SubscriptionsChangedAsync</c> says what the broker granted.
/// </summary>
/// <remarks>
/// The worker runs against a fake client whose <c>SubscribeAsync</c> returns like the real one does
/// without a broker, and the check is read from the health-check service the way <c>/healthcheck</c>
/// reads it.
/// </remarks>
[TestClass]
public sealed class WorkerSubscriptionReadinessTest
{
    private const string Values = "machines/+/timeseries/#";
    private const string Status = "machines/+/status/#";

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task AfterStart_WithoutASuback_TheSubscriptionIsUnhealthyAndNamesEachFilter()
    {
        var client = new Mock<IManagedMqttClient>();
        await using var services = Services();
        using var worker = StartedWorker(client, services);

        await Task.Delay(200, TestContext.CancellationToken);
        var entry = await CheckAsync(services);

        Assert.AreEqual(HealthStatus.Unhealthy, entry.Status, "SubscribeAsync returned, the broker has not answered");
        Assert.Contains($"'{Values}' (no SUBACK)", entry.Description ?? string.Empty);
        Assert.Contains($"'{Status}' (no SUBACK)", entry.Description ?? string.Empty);
        client.Verify(c => c.SubscribeAsync(It.IsAny<IEnumerable<MqttTopicFilter>>()), Times.Exactly(2));

        await worker.StopAsync(TestContext.CancellationToken);
    }

    [TestMethod]
    public async Task OnceTheBrokerGrantsEveryFilter_TheSubscriptionIsHealthy()
    {
        var client = new Mock<IManagedMqttClient>();
        await using var services = Services();
        using var worker = StartedWorker(client, services);
        await Task.Delay(200, TestContext.CancellationToken);

        var before = await CheckAsync(services);
        Assert.AreEqual(HealthStatus.Unhealthy, before.Status, "no SUBACK yet");

        await RaiseSubackAsync(client, (Values, MqttClientSubscribeResultCode.GrantedQoS1));
        var partly = await CheckAsync(services);
        await RaiseSubackAsync(client, (Status, MqttClientSubscribeResultCode.GrantedQoS1));
        var granted = await CheckAsync(services);

        Assert.AreEqual(HealthStatus.Unhealthy, partly.Status, "one filter granted is not all of them");
        Assert.Contains($"'{Status}' (no SUBACK)", partly.Description ?? string.Empty);
        Assert.AreEqual(HealthStatus.Healthy, granted.Status, granted.Description);

        await worker.StopAsync(TestContext.CancellationToken);
    }

    private static ServiceProvider Services()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddHealthChecks().AddMqttSubscription();
        return services.BuildServiceProvider();
    }

    private Worker StartedWorker(Mock<IManagedMqttClient> client, ServiceProvider services)
    {
        var config = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.test.json", optional: true)
            .Build()
            .GetSection("Config")
            .Get<Config>() ?? throw new InvalidOperationException("Missing or invalid configuration.");
        config.Topics.Clear();
        config.Topics.Add(Values);
        config.Topics.Add(Status);

        var worker = new Worker(
            Options.Create(config),
            NullLogger<Worker>.Instance,
            Options.Create(JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions),
            Mock.Of<IBaseUnitValueService>(),
            Mock.Of<IStringValueService>(),
            Mock.Of<IBooleanValueService>(),
            client.Object,
            services.GetRequiredService<MqttSubscriptionReadiness>());
        _ = worker.StartAsync(TestContext.CancellationToken);
        return worker;
    }

    private static Task RaiseSubackAsync(
        Mock<IManagedMqttClient> client, params (string Topic, MqttClientSubscribeResultCode Code)[] answers)
    {
        var items = answers
            .Select(answer => new MqttClientSubscribeResultItem(new MqttTopicFilter { Topic = answer.Topic }, answer.Code))
            .ToList();
        var suback = new MqttClientSubscribeResult(1, items, string.Empty, []);
        return client.RaiseAsync(c => c.SubscriptionsChangedAsync += null, new SubscriptionsChangedEventArgs([suback], []));
    }

    private async Task<HealthReportEntry> CheckAsync(ServiceProvider services)
    {
        var report = await services.GetRequiredService<HealthCheckService>()
            .CheckHealthAsync(r => r.Name == "mqtt-subscription", TestContext.CancellationToken);
        return report.Entries["mqtt-subscription"];
    }
}
