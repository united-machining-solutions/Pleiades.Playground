using Microsoft.Extensions.Options;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.Common.DataTransferObjects;

namespace Pleiades.Playground.Timeseries.Generators.StringValue;

public class StringValueGenerator : IStringValueGenerator
{
    private readonly StringValueGeneratorConfig _config;
    private readonly IManagedMqttClient _mqttClient;

    public StringValueGenerator(IOptions<StringValueGeneratorConfig> config, IManagedMqttClient mqttClient)
    {
        ArgumentNullException.ThrowIfNull(config);
        _config = config.Value ?? throw new ArgumentNullException(nameof(config));
        _mqttClient = mqttClient ?? throw new ArgumentNullException(nameof(mqttClient));
    }

    public event EventHandler<MessageGeneratedEventArgs<StringValueDto>>? MessageGenerated;

    public void StartGeneratingValues(CancellationToken stoppingToken)
    {
        // Spawn one publishing loop per configured topic
        if (_config.Topics is null || _config.Topics.Count == 0)
        {
            return;
        }

        foreach (var topicConfig in _config.Topics)
        {
            _ = Task.Run(async () =>
            {
                var fullTopic = _config.BaseTopic + topicConfig.Topic;

                // Decide number of runs (-1 means infinite)
                var runsRemaining = topicConfig.NumberOfRuns;

                while (!stoppingToken.IsCancellationRequested && (runsRemaining < 0 || runsRemaining > 0))
                {
                    foreach (var valueConfig in topicConfig.Values)
                    {
                        if (stoppingToken.IsCancellationRequested)
                        {
                            break;
                        }
                        if (valueConfig.Repeat)
                        {
                            // Repeat the same value for the specified duration at sampling interval
                            var duration = valueConfig.Duration!.Value;
                            var sampling = valueConfig.SamplingInterval!.Value;

                            var endAt = DateTime.UtcNow + duration;
                            while (!stoppingToken.IsCancellationRequested && DateTime.UtcNow < endAt)
                            {
                                await PublishOnce(fullTopic, valueConfig.Value).ConfigureAwait(false);
                                // Respect cancellation during delay
                                await Task.Delay(sampling, stoppingToken).ConfigureAwait(false);
                            }
                        }
                        else
                        {
                            // Publish once, then delay before next value
                            await PublishOnce(fullTopic, valueConfig.Value).ConfigureAwait(false);
                            var delay = valueConfig.Delay!.Value;
                            await Task.Delay(delay, stoppingToken).ConfigureAwait(false);
                        }
                    }

                    if (runsRemaining > 0)
                    {
                        runsRemaining--;
                    }
                }
            }, stoppingToken);
        }
    }

    private async Task PublishOnce(string topic, string value)
    {
        var message = new StringValueDto
        {
            Value = value,
            Timestamp = DateTime.UtcNow
        };
        await _mqttClient.Publish(topic, message).ConfigureAwait(false);
        MessageGenerated?.Invoke(this, new MessageGeneratedEventArgs<StringValueDto>
        {
            Topic = topic,
            Message = message
        });
    }
}
