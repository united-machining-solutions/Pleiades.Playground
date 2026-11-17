using System.Text.Json;
using Pleiades.Playground.OpcUa.Adapter.McpTools;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

[TestClass]
public class ScanConnectTest
{
    private static Dictionary<string, JsonElement> Arguments(string json) =>
        JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

    [TestMethod]
    public void A_call_with_a_user_name_or_a_password_is_a_call_with_a_user()
    {
        CollectionAssert.AreEqual(
            new[] { "authType", "username", "password" },
            ScanConnect.UserIn(Arguments("""{"endpointUrl":"opc.tcp://m:4840","authType":"UserName","username":"admin","password":"admin"}""")).ToArray());
        CollectionAssert.AreEqual(
            new[] { "password" },
            ScanConnect.UserIn(Arguments("""{"endpointUrl":"opc.tcp://m:4840","Password":"secret"}""")).ToArray());
    }

    [TestMethod]
    public void An_anonymous_call_passes()
    {
        Assert.IsEmpty(ScanConnect.UserIn(Arguments("""{"endpointUrl":"opc.tcp://m:4840","autoAcceptCerts":true,"name":"scan"}""")));
        Assert.IsEmpty(ScanConnect.UserIn(Arguments("""{"endpointUrl":"opc.tcp://m:4840","authType":"Anonymous","username":null,"password":""}""")));
        Assert.IsEmpty(ScanConnect.UserIn(null));
    }

    [TestMethod]
    public void The_schema_of_the_tool_has_no_arguments_of_a_user()
    {
        var schema = JsonSerializer.SerializeToElement(new
        {
            type = "object",
            properties = new
            {
                endpointUrl = new { type = "string" },
                authType = new { type = "string" },
                username = new { type = "string" },
                password = new { type = "string" },
                name = new { type = "string" },
            },
            required = new[] { "endpointUrl", "username" },
        });

        var stripped = ScanConnect.WithoutUser(schema);

        var properties = stripped.GetProperty("properties").EnumerateObject().Select(property => property.Name).ToArray();
        CollectionAssert.AreEqual(new[] { "endpointUrl", "name" }, properties);
        CollectionAssert.AreEqual(new[] { "endpointUrl" }, stripped.GetProperty("required").EnumerateArray().Select(item => item.GetString()).ToArray());
    }
}
