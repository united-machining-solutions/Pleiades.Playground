using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using MQTTnet.Extensions.ManagedClient;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Timeseries.Api.Client.BaseUnitValue;
using Pleiades.Playground.Timeseries.Api.Client.BooleanValue;
using Pleiades.Playground.Timeseries.Api.Client.StringValue;
using Pleiades.Playground.Timeseries.Common.Daos;
using Pleiades.Playground.Timeseries.DataTransferObjects;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.HealthChecks.Mqtt;

namespace Pleiades.Playground.Timeseries.Persistence.Test;

/// <summary>
/// Covers the M07 worker-resilience behaviour (loss-window fix, gap G-010):
/// a failed POST requeues its batch instead of dropping it, and the buffer growth is capped.
/// </summary>
[TestClass]
public class WorkerResilienceTest
{
    private const string _topic = "0000-0000/unittest";

    // Mirrors Worker.MaxBufferedItems (private const in the worker).
    private const int _maxBufferedItems = 500_000;

    private static readonly double[] _expectedRequeuedValues = [1.0, 2.0, 3.0];

    private readonly JsonSerializerOptions _jsonSerializerOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;

    private Worker CreateWorker(IBaseUnitValueService baseUnitValueService)
    {
        var mqtt = new Mock<IManagedMqttClient>();
        var stringValueService = new Mock<IStringValueService>();
        var booleanValueService = new Mock<IBooleanValueService>();

        var config = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
            .AddJsonFile("appsettings.test.json", optional: true, reloadOnChange: true)
            .Build();

        var configInstance = config.GetSection("Config").Get<Config>();
        ArgumentNullException.ThrowIfNull(configInstance);

        return new Worker(Options.Create(configInstance), NullLogger<Worker>.Instance, Options.Create(_jsonSerializerOptions),
            baseUnitValueService, stringValueService.Object, booleanValueService.Object, mqtt.Object,
            new MqttSubscriptionReadiness());
    }

    private static BaseUnitValueDao CreateDao(double value) => new()
    {
        Timestamp = DateTime.UtcNow,
        Topic = _topic,
        Unit = BaseUnit.Metre,
        Value = value
    };

    [TestMethod]
    public async Task PostFailure_RequeuesBatch_ForNextDetach()
    {
        // Arrange: a service whose POST always throws (simulated transient outage).
        var baseUnitValueService = new Mock<IBaseUnitValueService>();
        baseUnitValueService
            .Setup(s => s.PostBaseUnitValues(It.IsAny<Dictionary<string, BaseUnitSeriesRequestDto>>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("simulated outage"));

        using var worker = CreateWorker(baseUnitValueService.Object);

        worker.AddBaseUnitValue(CreateDao(1.0));
        worker.AddBaseUnitValue(CreateDao(2.0));
        worker.AddBaseUnitValue(CreateDao(3.0));

        // Act: the flush detaches (empties) the buffer, the POST fails, the batch must be requeued.
        var batch = worker.DetachBaseUnitValues();
        Assert.HasCount(3, batch);

        await worker.PostBaseUnitValuesIfNotEmpty(batch).ConfigureAwait(false);

        // Assert: the failed batch is back in the buffer, in order, for the next flush.
        var requeued = worker.DetachBaseUnitValues();
        Assert.HasCount(3, requeued);
        CollectionAssert.AreEqual(_expectedRequeuedValues, requeued.Select(v => v.Value).ToArray());
        baseUnitValueService.Verify(
            s => s.PostBaseUnitValues(It.IsAny<Dictionary<string, BaseUnitSeriesRequestDto>>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [TestMethod]
    public void AddBaseUnitValue_BoundsGrowthAtCap()
    {
        // Arrange
        var baseUnitValueService = new Mock<IBaseUnitValueService>();
        using var worker = CreateWorker(baseUnitValueService.Object);

        // Act: push more than the cap; the overflow must be dropped rather than grow unbounded.
        for (var i = 0; i < _maxBufferedItems + 5; i++)
        {
            worker.AddBaseUnitValue(CreateDao(i));
        }

        // Assert: exactly the cap is retained.
        var batch = worker.DetachBaseUnitValues();
        Assert.HasCount(_maxBufferedItems, batch);
    }
}
