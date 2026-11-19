using Pleiades.Playground.Sites.Api.DataAccessObjects;
using Pleiades.Playground.Sites.Api.DataTransferObjects;
using Pleiades.Playground.Sites.Api.Endpoints;

namespace Pleiades.Playground.Sites.Api.Test;

[TestClass]
public sealed class SiteRulesTests
{
    [TestMethod]
    [DataRow("north/plant")]
    [DataRow("north+plant")]
    [DataRow("north#plant")]
    [DataRow("/")]
    [DataRow("")]
    [DataRow("   ")]
    [DataRow(null)]
    [DataRow("north%2Fplant")]
    [DataRow("100%")]
    [DataRow(" north-plant")]
    [DataRow("north-plant ")]
    [DataRow("north-plant\t")]
    public void CheckTopicLevel_RefusesWhatALevelOfAnMqttTopicCannotHold(string? value) =>
        Assert.IsNotNull(SiteRules.CheckTopicLevel(value, "site id"));

    [TestMethod]
    [DataRow(double.NaN, 1d)]
    [DataRow(1d, double.NaN)]
    [DataRow(double.PositiveInfinity, 1d)]
    [DataRow(1d, double.NegativeInfinity)]
    [DataRow(-0.001, 1d)]
    [DataRow(1d, 1000.001)]
    public void CheckPosition_RefusesWhatIsNoPlaceOnThePlan(double x, double y) =>
        Assert.IsNotNull(SiteRules.CheckPosition(new PositionRequestV1(x, y)));

    [TestMethod]
    [DataRow(0d, 0d)]
    [DataRow(12.5, 4d)]
    [DataRow(1000d, 1000d)]
    public void CheckPosition_AcceptsEveryPlaceOnThePlan(double x, double y) =>
        Assert.IsNull(SiteRules.CheckPosition(new PositionRequestV1(x, y)));

    [TestMethod]
    [DataRow("north-plant")]
    [DataRow("M-05")]
    [DataRow("Plant 3 (Süd)")]
    public void CheckTopicLevel_AcceptsEveryOtherName(string value) =>
        Assert.IsNull(SiteRules.CheckTopicLevel(value, "site id"));

    [TestMethod]
    public void CheckSite_AcceptsASiteWithoutHalls() =>
        Assert.IsNull(SiteRules.CheckSite(new SiteRequestV1("Demo Manufacturing", "North plant", null)));

    [TestMethod]
    [DataRow(null, "North plant", "company")]
    [DataRow(" ", "North plant", "company")]
    [DataRow("Demo Manufacturing", null, "name")]
    [DataRow("Demo Manufacturing", "", "name")]
    public void CheckSite_RequiresCompanyAndName(string? company, string? name, string missing)
    {
        var error = SiteRules.CheckSite(new SiteRequestV1(company, name, ["Hall 1"]));

        Assert.IsNotNull(error);
        Assert.Contains(missing, error, StringComparison.Ordinal);
    }

    [TestMethod]
    public void CheckSite_RefusesAHallNamedTwice()
    {
        var error = SiteRules.CheckSite(new SiteRequestV1("Demo Manufacturing", "North plant", ["Hall 1", "Hall 2", "Hall 1"]));

        Assert.IsNotNull(error);
        Assert.Contains("'Hall 1'", error, StringComparison.Ordinal);
    }

    [TestMethod]
    public void CheckSite_RefusesAHallWithoutName() =>
        Assert.IsNotNull(SiteRules.CheckSite(new SiteRequestV1("Demo Manufacturing", "North plant", ["Hall 1", " "])));

    [TestMethod]
    [DataRow("north/plant")]
    [DataRow("north+plant")]
    [DataRow("north#plant")]
    [DataRow(null)]
    public void CheckPlacement_RefusesASiteIdThatIsNoLevelOfATopic(string? siteId) =>
        Assert.IsNotNull(SiteRules.CheckPlacement(new PlacementRequestV1(siteId, null, null)));

    [TestMethod]
    public void CheckPlacement_RefusesABlankHallOrDisplayName()
    {
        Assert.IsNotNull(SiteRules.CheckPlacement(new PlacementRequestV1("north-plant", " ", null)));
        Assert.IsNotNull(SiteRules.CheckPlacement(new PlacementRequestV1("north-plant", null, "")));
    }

    [TestMethod]
    public void CheckPlacementOnSite_RequiresTheSiteAndOneOfItsHalls()
    {
        var site = new SiteDao { SiteId = "north-plant", Company = "Demo Manufacturing", Name = "North plant", Halls = ["Hall 1"] };

        Assert.IsNotNull(SiteRules.CheckPlacementOnSite(new PlacementRequestV1("north-plant", null, null), site: null));
        Assert.IsNotNull(SiteRules.CheckPlacementOnSite(new PlacementRequestV1("north-plant", "Hall 9", null), site));
        Assert.IsNull(SiteRules.CheckPlacementOnSite(new PlacementRequestV1("north-plant", "Hall 1", null), site));
        Assert.IsNull(SiteRules.CheckPlacementOnSite(new PlacementRequestV1("north-plant", null, null), site));
    }
}
