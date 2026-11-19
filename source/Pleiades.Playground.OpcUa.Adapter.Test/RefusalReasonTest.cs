using System.Text.Json;
using ModelContextProtocol.Protocol;
using Opc.Ua;
using Pleiades.Playground.OpcUa.Adapter.McpTools;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

namespace Pleiades.Playground.OpcUa.Adapter.Test;

/// <summary>
/// A refused connect is told with the words of the server: trust the adapter where the server gives no reason, choose
/// another security where it says it cannot handle the one of the endpoint.
/// </summary>
[TestClass]
public class RefusalReasonTest
{
    private const string Url = "opc.tcp://machine:4840";
    private const string Status = "BadSecurityChecksFailed";

    /// <summary>What a server answered that offers Aes256_Sha256_RsaPss but cannot verify an RSA-PSS signature.</summary>
    private const string RsaPss = "Unexpected SignatureData algorithm: http://www.w3.org/2001/04/xmldsig-more#rsa-pss-sha256";

    public required TestContext TestContext { get; set; }

    [TestMethod]
    public void The_reason_is_the_text_in_quotes_after_the_status_and_none_without_one()
    {
        Assert.AreEqual(RsaPss, RefusalPolicy.ReasonIn($"[80130000] ({Status}) '{RsaPss}'", Status));
        Assert.AreEqual(RsaPss, RefusalPolicy.ReasonIn($"[80130000] ({Status}) \\u0027{RsaPss}\\u0027", Status), "Also where JSON escaped the quotes.");
        Assert.AreEqual(RsaPss, RefusalPolicy.ReasonIn(RsaPss, Status), "An exception may carry the reason alone.");
        Assert.IsNull(RefusalPolicy.ReasonIn($"Connect failed: [80130000] ({Status})", Status));
        Assert.IsNull(RefusalPolicy.ReasonIn(Status, Status));
        Assert.IsNull(RefusalPolicy.ReasonIn("", Status));
        Assert.IsNull(RefusalPolicy.ReasonIn("Connect failed for the scan", Status, quotedOnly: true), "A tool result gives only a quoted reason.");
    }

    [TestMethod]
    public void A_signature_or_a_policy_the_server_does_not_expect_is_a_security_it_cannot_handle()
    {
        Assert.IsTrue(RefusalPolicy.IsUnsupportedSecurity(RsaPss));
        Assert.IsTrue(RefusalPolicy.IsUnsupportedSecurity("The SecurityPolicy is not supported."));
        Assert.IsFalse(RefusalPolicy.IsUnsupportedSecurity("Error received from remote host"));
        Assert.IsFalse(RefusalPolicy.IsUnsupportedSecurity("Certificate is not trusted."));
        Assert.IsFalse(RefusalPolicy.IsUnsupportedSecurity(null));
    }

    [TestMethod]
    public void A_server_that_cannot_handle_the_policy_is_told_to_choose_another_security_not_to_trust_the_adapter()
    {
        var text = OpcUaClient.RejectedCertificate(
            Url, new ServiceResultException(StatusCodes.BadSecurityChecksFailed, RsaPss), "SignAndEncrypt with Aes256_Sha256_RsaPss");

        Assert.Contains(Url, text);
        Assert.Contains(Status, text);
        Assert.Contains("SignAndEncrypt with Aes256_Sha256_RsaPss", text);
        Assert.Contains(RsaPss, text, "The words of the server are told as they are.");
        Assert.Contains("Choose the security", text);
        Assert.DoesNotContain("does not trust the certificate", text);
    }

    [TestMethod]
    public void A_refusal_without_a_reason_of_the_security_still_says_how_to_trust_the_adapter_and_what_the_server_said()
    {
        var text = OpcUaClient.RejectedCertificate(Url, new ServiceResultException(StatusCodes.BadSecurityChecksFailed, "Error received from remote host"));

        Assert.Contains("does not trust the certificate of the adapter", text);
        Assert.Contains("\"Error received from remote host\"", text);
        Assert.Contains(OpcUaClient.ApplicationName, text);
    }

    [TestMethod]
    public async Task A_scan_the_server_cannot_handle_names_the_endpoint_and_points_to_another_security()
    {
        var offered = new OfferedEndpoint(Url, SecurityMode.SignAndEncrypt, "Aes256_Sha256_RsaPss", true, "AABBCC");
        // The library writes its error as JSON, with the quotes of the reason escaped.
        var library = JsonSerializer.Serialize(new { error = true, statusCode = Status, message = $"[80130000] ({Status}) '{RsaPss}'" });

        var result = await ScanConnect.CallAsync(
            new CallToolRequestParams
            {
                Name = ScanConnect.ToolName,
                Arguments = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>($$"""{"endpointUrl":"{{Url}}"}""")!,
            },
            _ => null,
            (url, _) => Task.FromResult(new EndpointOffer(url, [offered], null)),
            (_, _, _) => Task.FromResult(false),
            // As the library answers: the failure is in the JSON, IsError is not set.
            (_, _) => ValueTask.FromResult(new CallToolResult { Content = [new TextContentBlock { Text = library }] }),
            TestContext.CancellationToken);

        Assert.IsTrue(result.IsError, "The refused connect is a failure for the chat as well.");
        var texts = result.Content.OfType<TextContentBlock>().Select(block => block.Text).ToList();
        Assert.HasCount(2, texts, "The error of the library stays, the hint comes after it.");
        Assert.Contains("SignAndEncrypt with Aes256_Sha256_RsaPss", texts[1]);
        Assert.Contains(RsaPss, texts[1]);
        Assert.Contains("Choose the security", texts[1]);
        Assert.DoesNotContain("does not trust the certificate", texts[1]);
    }
}
