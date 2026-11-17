using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using MQTTnet;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Timeseries.Api.Client.BaseUnitValue;
using Pleiades.Playground.Timeseries.Api.Client.BooleanValue;
using Pleiades.Playground.Timeseries.Api.Client.StringValue;
using Pleiades.Playground.Timeseries.Common.Daos;
using Pleiades.Playground.Timeseries.DataTransferObjects;
using Pleiades.Playground.Common.DataTransferObjects;
using Pleiades.Playground.HealthChecks.Mqtt;

namespace Pleiades.Playground.Timeseries.Persistence.Test;

[TestClass]
public class WorkerTest : IDisposable
{
    private readonly Dictionary<string, BaseUnitValueDao> _baseUnitValues = [];
    private readonly Dictionary<string, StringValueDao> _stringUnitValues = [];
    private readonly Dictionary<string, BooleanValueDao> _booleanValues = [];
    private bool _disposedValue;
    private const string _topic = "0000-0000/unittest";
    private readonly JsonSerializerOptions _jsonSerializerOptions = JsonSerializerOptionsExtension.PleiadesDefaultJsonOptions;
    private const int _workerStartupDelay = 3000;
    private const int _waitBeforeCheckDelay = 5000;

    private (Worker worker, Mock<IManagedMqttClient> mqttClient) SetupWorker()
    {
        var mqtt = new Mock<IManagedMqttClient>();
        var baseUnitValueService = new Mock<IBaseUnitValueService>();
        var stringValueService = new Mock<IStringValueService>();
        var booleanValueService = new Mock<IBooleanValueService>();

        baseUnitValueService.Setup(s => s.PostBaseUnitValues(It.IsAny<Dictionary<string, BaseUnitSeriesRequestDto>>(), It.IsAny<CancellationToken>()))
            .Callback<Dictionary<string, BaseUnitSeriesRequestDto>, CancellationToken>((values, cancellationToken) =>
            {
                foreach (var kvp in values)
                {
                    var topic = kvp.Key;
                    var baseUnitValue = kvp.Value;
                    var unit = kvp.Value.Unit;

                    foreach (var dataPoint in baseUnitValue.DataPoints)
                    {
                        _baseUnitValues[topic] = new BaseUnitValueDao
                        {
                            Timestamp = dataPoint.Timestamp,
                            Topic = topic,
                            Value = dataPoint.Value,
                            Unit = unit
                        };
                    }
                }
            })
            .ReturnsAsync(new TimeseriesInsertResultDto { ValuesCount = _baseUnitValues.Count });

        stringValueService.Setup(s => s.PostStringValues(It.IsAny<Dictionary<string, StringSeriesRequestDto>>(), It.IsAny<CancellationToken>()))
            .Callback<Dictionary<string, StringSeriesRequestDto>, CancellationToken>((values, cancellationToken) =>
            {
                foreach (var kvp in values)
                {
                    var topic = kvp.Key;
                    var stringValue = kvp.Value;

                    foreach (var dataPoint in stringValue.DataPoints)
                    {
                        _stringUnitValues[topic] = new StringValueDao
                        {
                            Timestamp = dataPoint.Timestamp,
                            Topic = topic,
                            Value = dataPoint.Value!
                        };
                    }
                }
            })
            .ReturnsAsync(new TimeseriesInsertResultDto { ValuesCount = _stringUnitValues.Count });

        booleanValueService.Setup(s => s.PostBooleanValues(It.IsAny<Dictionary<string, BooleanSeriesRequestDto>>(), It.IsAny<CancellationToken>()))
           .Callback<Dictionary<string, BooleanSeriesRequestDto>, CancellationToken>((values, cancellationToken) =>
           {
               foreach (var kvp in values)
               {
                   var topic = kvp.Key;
                   var booleanValue = kvp.Value;

                   foreach (var dataPoint in booleanValue.DataPoints)
                   {
                       _booleanValues[topic] = new BooleanValueDao
                       {
                           Timestamp = dataPoint.Timestamp,
                           Topic = topic,
                           Value = dataPoint.Value!
                       };
                   }
               }
           })
           .ReturnsAsync(new TimeseriesInsertResultDto { ValuesCount = _booleanValues.Count });

        mqtt.Setup(x => x.IsConnected).Returns(true);

        var config = new ConfigurationBuilder()
            .AddJsonFile("appsettings.json", optional: true, reloadOnChange: true)
            .AddJsonFile("appsettings.test.json", optional: true, reloadOnChange: true)
            .Build();

        var configInstance = config.GetSection("Config").Get<Config>();
        ArgumentNullException.ThrowIfNull(configInstance);

        var worker = new Worker(Options.Create(configInstance), NullLogger<Worker>.Instance, Options.Create(_jsonSerializerOptions),
            baseUnitValueService.Object, stringValueService.Object, booleanValueService.Object, mqtt.Object,
            new MqttSubscriptionReadiness());

        return (worker, mqtt);
    }

    [TestMethod]
    public async Task BaseUnitValueDtoSuccessfullTest()
    {
        // Arrange
        var (worker, mqtt) = SetupWorker();
        _baseUnitValues.Clear();

        // Act
        await worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(_workerStartupDelay).ConfigureAwait(false);

        var testValue = 0.123;
        var testTimestamp = DateTime.UtcNow;
        var baseUnitValueDto = new BaseUnitValueDto
        {
            Value = testValue,
            Timestamp = testTimestamp,
            Unit = BaseUnit.Metre
        };

        var payload = JsonSerializer.Serialize(baseUnitValueDto, _jsonSerializerOptions);

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(_topic)
            .WithContentType("baseunitvaluedto")
            .WithPayload(payload).Build();

        await mqtt.RaiseAsync(s => s.ApplicationMessageReceivedAsync += null, (object)(new MqttApplicationMessageReceivedEventArgs("", message, new MQTTnet.Packets.MqttPublishPacket(), null))).ConfigureAwait(false);

        await Task.Delay(_waitBeforeCheckDelay).ConfigureAwait(false);

        // Assert
        Assert.HasCount(1, _baseUnitValues);
        Assert.IsTrue(_baseUnitValues.TryGetValue(_topic, out var value));
        Assert.IsNotNull(value);
        Assert.IsInstanceOfType<BaseUnitValueDao>(value);
        var baseUnitValueModel = value as BaseUnitValueDao;
        Assert.IsNotNull(baseUnitValueModel);
        Assert.AreEqual(testValue, baseUnitValueModel.Value);
        Assert.AreEqual(testTimestamp, baseUnitValueModel.Timestamp);
        Assert.AreEqual(BaseUnit.Metre, baseUnitValueModel.Unit);
        Assert.AreEqual(_topic, baseUnitValueModel.Topic);
    }

    private const string MachineTopic = "machines/alcyone-machines_AX-400_P-04/umati";

    private static async Task DeliverModelValue(Mock<IManagedMqttClient> mqtt, string topic, string payload)
    {
        var message = new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithContentType("application/json")
            .WithPayload(payload).Build();
        await mqtt.RaiseAsync(s => s.ApplicationMessageReceivedAsync += null,
            (object)(new MqttApplicationMessageReceivedEventArgs("", message, new MQTTnet.Packets.MqttPublishPacket(), null))).ConfigureAwait(false);
    }

    [TestMethod]
    public async Task ModelValue_IsKeptInTheUnitItCameIn_ANumberWithoutOneInOne()
    {
        var (worker, mqtt) = SetupWorker();
        _baseUnitValues.Clear();
        await worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(_workerStartupDelay).ConfigureAwait(false);

        await DeliverModelValue(mqtt, $"{MachineTopic}/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp",
            """{ "timestamp": "2026-11-17T09:15:00.000Z", "value": 81234567.5, "unit": "wattHour" }""").ConfigureAwait(false);
        await DeliverModelValue(mqtt, $"{MachineTopic}/OperationCounters/PartsProducedInLifetime",
            """{ "timestamp": "2026-11-17T09:15:00.000Z", "value": 184223, "unit": "piece" }""").ConfigureAwait(false);
        await DeliverModelValue(mqtt, $"{MachineTopic}/Connection/Heartbeat",
            """{ "timestamp": "2026-11-17T09:15:00.000Z", "value": 17 }""").ConfigureAwait(false);
        await Task.Delay(_waitBeforeCheckDelay).ConfigureAwait(false);

        var energy = _baseUnitValues[$"{MachineTopic}/Consumption/Electricity/Main/AcActiveEnergyTotalImportHp"];
        Assert.AreEqual(BaseUnit.WattHour, energy.Unit, "no conversion to joule");
        Assert.AreEqual(81234567.5, energy.Value);
        Assert.AreEqual(BaseUnit.Piece, _baseUnitValues[$"{MachineTopic}/OperationCounters/PartsProducedInLifetime"].Unit);
        Assert.AreEqual(BaseUnit.One, _baseUnitValues[$"{MachineTopic}/Connection/Heartbeat"].Unit);
    }

    [TestMethod]
    public async Task Snapshot_IsKeptFieldByField_AndListsNullAndTheManifestAreNoSeries()
    {
        var (worker, mqtt) = SetupWorker();
        _stringUnitValues.Clear();
        _baseUnitValues.Clear();
        _booleanValues.Clear();
        await worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(_workerStartupDelay).ConfigureAwait(false);

        await DeliverModelValue(mqtt, $"{MachineTopic}/State/Status",
            """{ "timestamp": "2026-11-17T09:15:02.123Z", "value": { "MachineryItemState": "Executing", "MachineryOperationMode": "Processing" } }""").ConfigureAwait(false);
        await DeliverModelValue(mqtt, $"{MachineTopic}/WorkMasterMonitoring/ProgramExecution",
            """{ "timestamp": "2026-11-17T09:15:02.123Z", "value": { "ExecutionId": "e-1", "State": "Ended", "Duration": 60.5 } }""").ConfigureAwait(false);
        await DeliverModelValue(mqtt, $"{MachineTopic}/JobMonitoring/JobOrders",
            """{ "timestamp": "2026-11-17T09:15:02.123Z", "value": [ { "JobOrderID": "4711/01" } ] }""").ConfigureAwait(false);
        await DeliverModelValue(mqtt, $"{MachineTopic}/Production/ActiveWorkMaster",
            """{ "timestamp": "2026-11-17T09:15:02.123Z", "value": null }""").ConfigureAwait(false);
        await DeliverModelValue(mqtt, $"{MachineTopic}/Manifest",
            """{ "modelVersion": "0.17.1", "machineId": "alcyone-machines_AX-400_P-04", "profiles": ["Core"] }""").ConfigureAwait(false);
        await Task.Delay(_waitBeforeCheckDelay).ConfigureAwait(false);

        Assert.AreEqual("Executing", _stringUnitValues[$"{MachineTopic}/State/Status/MachineryItemState"].Value);
        Assert.AreEqual("Processing", _stringUnitValues[$"{MachineTopic}/State/Status/MachineryOperationMode"].Value);
        Assert.AreEqual(new DateTime(2026, 11, 17, 9, 15, 2, 123, DateTimeKind.Utc), _stringUnitValues[$"{MachineTopic}/State/Status/MachineryItemState"].Timestamp);
        Assert.AreEqual("Ended", _stringUnitValues[$"{MachineTopic}/WorkMasterMonitoring/ProgramExecution/State"].Value);
        Assert.IsFalse(_baseUnitValues.ContainsKey($"{MachineTopic}/WorkMasterMonitoring/ProgramExecution/Duration"), "a number of a snapshot has no unit");
        Assert.IsFalse(_stringUnitValues.Keys.Any(k => k.Contains("JobOrders", StringComparison.Ordinal) || k.Contains("Manifest", StringComparison.Ordinal) || k.Contains("ActiveWorkMaster", StringComparison.Ordinal)));
        Assert.IsEmpty(_booleanValues);
    }

    [TestMethod]
    public async Task BaseUnitValueNoValueTest()
    {
        // Arrange
        var (worker, mqtt) = SetupWorker();
        _baseUnitValues.Clear();

        // Act
        await worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(_workerStartupDelay).ConfigureAwait(false);

        var testTimestamp = DateTime.UtcNow;

        var dto = new
        {
            unit = "metre",
            timestamp = testTimestamp
        };

        var payload = JsonSerializer.Serialize(dto, _jsonSerializerOptions);

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(_topic)
            .WithContentType("baseunitvalue")
            .WithPayload(payload).Build();

        await mqtt.RaiseAsync(s => s.ApplicationMessageReceivedAsync += null, (object)(new MqttApplicationMessageReceivedEventArgs("", message, new MQTTnet.Packets.MqttPublishPacket(), null))).ConfigureAwait(false);

        await Task.Delay(_waitBeforeCheckDelay).ConfigureAwait(false);

        // Assert
        Assert.IsEmpty(_baseUnitValues);
    }

    [TestMethod]
    public async Task BaseUnitValueWrongUnitTest()
    {
        // Arrange
        var (worker, mqtt) = SetupWorker();
        _baseUnitValues.Clear();

        // Act
        await worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(_workerStartupDelay).ConfigureAwait(false);

        var testTimestamp = DateTime.UtcNow;

        var dto = new
        {
            value = 0.123,
            unit = "asdasd",
            timestamp = testTimestamp
        };

        var payload = JsonSerializer.Serialize(dto, _jsonSerializerOptions);

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(_topic)
            .WithContentType("baseunitvalue")
            .WithPayload(payload).Build();

        await mqtt.RaiseAsync(s => s.ApplicationMessageReceivedAsync += null, (object)(new MqttApplicationMessageReceivedEventArgs("", message, new MQTTnet.Packets.MqttPublishPacket(), null))).ConfigureAwait(false);

        await Task.Delay(_waitBeforeCheckDelay, TestContext.CancellationToken).ConfigureAwait(false);

        // Assert
        Assert.IsEmpty(_baseUnitValues);
    }

    [TestMethod]
    public async Task StringValueDtoSuccessfullTest()
    {
        // Arrange
        var (worker, mqtt) = SetupWorker();
        _stringUnitValues.Clear();

        // Act
        await worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(_workerStartupDelay).ConfigureAwait(false);

        var testValue = "TestString";
        var testTimestamp = DateTime.UtcNow;
        var stringValueDto = new StringValueDto
        {
            Value = testValue,
            Timestamp = testTimestamp
        };

        var payload = JsonSerializer.Serialize(stringValueDto, _jsonSerializerOptions);

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(_topic)
            .WithContentType("stringvaluedto")
            .WithPayload(payload).Build();

        await mqtt.RaiseAsync(s => s.ApplicationMessageReceivedAsync += null, (object)(new MqttApplicationMessageReceivedEventArgs("", message, new MQTTnet.Packets.MqttPublishPacket(), null))).ConfigureAwait(false);

        await Task.Delay(_waitBeforeCheckDelay).ConfigureAwait(false);

        // Assert
        Assert.HasCount(1, _stringUnitValues);
        Assert.IsTrue(_stringUnitValues.TryGetValue(_topic, out var value));
        Assert.IsNotNull(value);
        Assert.IsInstanceOfType<StringValueDao>(value);
        var stringValueModel = value as StringValueDao;
        Assert.IsNotNull(stringValueModel);
        Assert.AreEqual(testValue, stringValueModel.Value);
        Assert.AreEqual(testTimestamp, stringValueModel.Timestamp);
    }

    [TestMethod]
    public async Task BooleanValueDtoSuccessfullTest()
    {
        // Arrange
        var (worker, mqtt) = SetupWorker();
        _booleanValues.Clear();

        // Act
        await worker.StartAsync(CancellationToken.None).ConfigureAwait(false);
        await Task.Delay(_workerStartupDelay).ConfigureAwait(false);

        var testValue = true;
        var testTimestamp = DateTime.UtcNow;
        var booleanValueDto = new BooleanValueDto
        {
            Value = testValue,
            Timestamp = testTimestamp
        };

        var payload = JsonSerializer.Serialize(booleanValueDto, _jsonSerializerOptions);

        var message = new MqttApplicationMessageBuilder()
            .WithTopic(_topic)
            .WithContentType("booleanvaluedto")
            .WithPayload(payload).Build();

        await mqtt.RaiseAsync(s => s.ApplicationMessageReceivedAsync += null, (object)(new MqttApplicationMessageReceivedEventArgs("", message, new MQTTnet.Packets.MqttPublishPacket(), null))).ConfigureAwait(false);

        await Task.Delay(_waitBeforeCheckDelay, TestContext.CancellationToken).ConfigureAwait(false);

        // Assert
        Assert.HasCount(1, _booleanValues);
        Assert.IsTrue(_booleanValues.TryGetValue(_topic, out var value));
        Assert.IsNotNull(value);
        Assert.IsInstanceOfType<BooleanValueDao>(value);
        var booleanValueModel = value as BooleanValueDao;
        Assert.IsNotNull(booleanValueModel);
        Assert.AreEqual(testValue, booleanValueModel.Value);
        Assert.AreEqual(testTimestamp, booleanValueModel.Timestamp);
    }

    protected virtual void Dispose(bool disposing)
    {
        if (!_disposedValue)
        {
            if (disposing)
            {
                // Dispose resources if needed
            }
            _disposedValue = true;
        }
    }

    public void Dispose()
    {
        Dispose(disposing: true);
        GC.SuppressFinalize(this);
    }

    public TestContext TestContext { get; set; }
}
