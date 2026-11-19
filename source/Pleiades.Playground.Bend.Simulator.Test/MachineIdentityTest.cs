using Pleiades.Playground.Bend.Simulator.Machine;

namespace Pleiades.Playground.Bend.Simulator.Test;

[TestClass]
public sealed class MachineIdentityTest
{
    [TestMethod]
    public void The_ProductInstanceUri_is_manufacturer_uri_model_and_serial_number()
    {
        var identity = MachineIdentity.From(new Config
        {
            Manufacturer = "Pfenibru", ManufacturerUri = "https://www.pfenibru.example/", Model = " L76 ", SerialNumber = "987654321",
        });

        Assert.AreEqual("L76", identity.Model);
        Assert.AreEqual("https://www.pfenibru.example/L76/987654321", identity.ProductInstanceUri,
            "the one the adapter publishes as Identification.ProductInstanceUri");
    }

    [TestMethod]
    public void A_configured_ProductInstanceUri_is_taken_as_it_is()
    {
        var identity = MachineIdentity.From(new Config { SerialNumber = "A123", ProductInstanceUri = "urn:machine:A123" });

        Assert.AreEqual("urn:machine:A123", identity.ProductInstanceUri);
    }

    [TestMethod]
    public void The_identity_always_comes_from_the_configuration()
    {
        using var harness = new SimulatorHarness();

        var restarted = harness.CreateRuntime(harness.NewConfig("4711", "Manufacturer_B", "M1"));

        Assert.AreEqual("https://www.trumpf.com/M1/4711", restarted.Identity.ProductInstanceUri,
            "read only: the configuration the adapter shares decides it");
    }
}
