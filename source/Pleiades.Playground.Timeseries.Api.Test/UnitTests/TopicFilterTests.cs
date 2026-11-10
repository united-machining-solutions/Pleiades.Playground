using System.Text.RegularExpressions;
using Pleiades.Playground.Timeseries.Api.Services.MongoDb;

namespace Pleiades.Playground.Timeseries.Api.Test.UnitTests;

/// <summary>
/// Unit tests for the pure topic-to-filter translation logic used by
/// <c>MongoTimeseriesService</c> (equality vs. anchored-regex wildcard handling).
/// </summary>
[TestClass]
public class TopicFilterTests
{
    [TestMethod]
    [DataRow("plant/a/temp", false)]
    [DataRow("", false)]
    [DataRow("plant/*/temp", true)]
    [DataRow("*", true)]
    public void HasWildcard_VariousTopics_DetectsAsterisk(string topic, bool expected)
    {
        // Act
        var actual = TopicFilter.HasWildcard(topic);

        // Assert
        Assert.AreEqual(expected, actual);
    }

    [TestMethod]
    [DataRow("plant/*", "^plant/.*$")]
    [DataRow("a/*/c", "^a/.*/c$")]
    [DataRow("*", "^.*$")]
    [DataRow("*/x/*", "^.*/x/.*$")]
    [DataRow("a.b+c(d)", @"^a\.b\+c\(d\)$")]
    public void ToAnchoredRegex_TopicWithMetacharacters_EscapesAndMapsWildcard(string topic, string expectedPattern)
    {
        // Act
        var actual = TopicFilter.ToAnchoredRegex(topic);

        // Assert
        Assert.AreEqual(expectedPattern, actual);
    }

    [TestMethod]
    public void ToAnchoredRegex_WildcardPattern_MatchesOnlyAnchoredSegments()
    {
        // Arrange
        var pattern = TopicFilter.ToAnchoredRegex("plant/*/temp");

        // Act
        var matches = Regex.IsMatch("plant/axis1/temp", pattern);
        var rejectsPrefix = Regex.IsMatch("other/axis1/temp", pattern);
        var rejectsSuffix = Regex.IsMatch("plant/axis1/temp/extra", pattern);

        // Assert
        Assert.IsTrue(matches);
        Assert.IsFalse(rejectsPrefix, "leading '^' anchor must reject a different prefix");
        Assert.IsFalse(rejectsSuffix, "trailing '$' anchor must reject a longer suffix");
    }

    [TestMethod]
    public void ToAnchoredRegex_TopicWithDot_TreatsDotAsLiteral()
    {
        // Arrange
        var pattern = TopicFilter.ToAnchoredRegex("a.b");

        // Act
        var matchesLiteral = Regex.IsMatch("a.b", pattern);
        var rejectsWildcard = Regex.IsMatch("aXb", pattern);

        // Assert
        Assert.IsTrue(matchesLiteral);
        Assert.IsFalse(rejectsWildcard, "an escaped '.' must not behave as a regex wildcard");
    }
}
