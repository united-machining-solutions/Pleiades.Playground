using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using ModelContextProtocol.Server;
using Opc.Ua.Mcp;
using Pleiades.Playground.Common.Json;
using Pleiades.Playground.Common.Logging;
using Pleiades.Playground.Common.Logging.Configuration;
using Pleiades.Playground.Common.Logging.Loki;
using Pleiades.Playground.Common.Logging.Models;
using Pleiades.Playground.HealthChecks.AspNetCore;
using Pleiades.Playground.HealthChecks.Mqtt;
using Pleiades.Playground.Mcp.Server;
using Pleiades.Playground.Mqtt.Extensions;
using Pleiades.Playground.OpcUa.Adapter;
using Pleiades.Playground.OpcUa.Adapter.Api;
using Pleiades.Playground.OpcUa.Adapter.Mapping;
using Pleiades.Playground.OpcUa.Adapter.McpTools;
using Pleiades.Playground.OpcUa.Adapter.OpcUa;
using Pleiades.Playground.OpcUa.Adapter.Registrations;

var builder = WebApplication.CreateSlimBuilder(args);

builder.Services.AddOptions<Config>()
    .BindConfiguration("Config")
    .ValidateDataAnnotations()
    .ValidateOnStart();

var serviceInfo = typeof(Program).Assembly
    .CreateServiceInfo(builder.Environment.EnvironmentName)
    .UseConfiguration(builder.Configuration);

builder.UsePleiadesLogging(serviceInfo, (loggerConfig, config) =>
{
    loggerConfig.WriteToLoki(config, serviceInfo, "Config:Loki");
});

builder.Services.AddOptions<MqttConfig>()
    .Bind(builder.Configuration.GetSection("Config:MqttDestination"))
    .ValidateDataAnnotations()
    .ValidateOnStart();
builder.Services.AddMqttClientHost().AddClient(builder.Configuration.GetSection("Config:MqttDestination"));

// The OPC UA MCP library of the OPC Foundation registers the OPC UA client first. What follows sets
// the name, the certificate store and the trust of that same client, so a scan and a running
// machine are one OPC UA application to a server: one certificate that it has to trust once.
// It lives in the data directory, so it survives the container.
builder.Services.AddOpcUaMcpCore();
var dataDirectory = builder.Configuration["Config:DataDirectory"] ?? "/data";
var applicationUri = builder.Configuration["Config:ApplicationUri"] ?? "urn:pleiades:playground:opcua:adapter";
builder.Services.AddOpcUa()
    .AddClient(options =>
    {
        options.ApplicationName = OpcUaClient.ApplicationName;
        options.ApplicationUri = applicationUri;
        options.ProductUri = "urn:pleiades:playground:opcua:adapter";
        options.PkiRoot = Path.Combine(dataDirectory, "pki");
        // The stack accepts the certificate of a server; the adapter itself then holds every
        // machine to the certificate its registration was made with (OpcUaClient.ConnectAsync).
        options.AutoAcceptUntrustedCertificates = true;
    })
    .AddDiscovery();

builder.Services.AddSingleton(new RegistrationStore(dataDirectory));
builder.Services.AddSingleton(new AlertStore(dataDirectory));
builder.Services.AddSingleton(services => new CredentialStore(
    dataDirectory, reason => services.GetRequiredService<ILogger<CredentialStore>>().CredentialsUnreadable(reason)));
builder.Services.AddSingleton<DraftStore>();
builder.Services.AddSingleton<OpcUaClient>();
builder.Services.AddSingleton<IRegistrationProbe, RegistrationProbe>();
// Every machine has its own connection to the broker, with its own last will (MachineOutput).
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IMachineOutputFactory, MachineOutputFactory>();
builder.Services.AddHostedService<OpcUaConfigurationShare>();
builder.Services.AddSingleton<MachineSupervisor>();
builder.Services.AddHostedService(services => services.GetRequiredService<MachineSupervisor>());

// The management API describes itself: that document is its contract (contracts/openapi).
builder.Services.AddOpenApi();

builder.Services.AddPleiadesDefaultJsonOptions();
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

// The MCP server of the adapter, on the standard of this repository: the tools a scan needs from
// the OPC UA MCP library (find, connect, browse, read; UaToolCatalogue takes the rest out), and
// the adapter's own (list, mapping, propose). No tool adds or removes a machine.
builder.Services.AddAuthorization();
builder.Services
    .AddPleiadesMcpServer(mcp =>
    {
        mcp.Prefix = "opcua";
        mcp.Name = "Pleiades-OpcUa";
        mcp.Title = "OPC UA adapter MCP server: scan OPC UA servers of machines and propose their registration.";
        mcp.OpenApiDocumentPath = null;
        mcp.Domains.Add("Servers: the OPC UA servers that are added, with endpoint, security and connection state");
        mcp.Domains.Add("Mapping: which node feeds which element of the data model, and what is unclear, mismatched or missing");
        mcp.Domains.Add("Scan: endpoints, browse and read of an OPC UA server (opcua_ua_*), read-only");
        mcp.Domains.Add("Registration: proposing a mapping; a person confirms it, no tool adds a machine");
        mcp.DiscoveryFlow.Add("Call opcua_get_skill_guide before the first scan: it has the procedure and the elements of the data model.");
        mcp.DiscoveryFlow.Add("Use opcua_server_list for what is added, opcua_mapping_show for one machine.");
        mcp.DiscoveryFlow.Add("To add a server: opcua_endpoint_rank, opcua_machine_list, opcua_ua_connect, opcua_ua_browse_all, opcua_ua_read_values, then opcua_registration_propose.");
        mcp.DiscoveryFlow.Add("A machine whose node is in urn:umati2:datamodel:opcua is mapped by the adapter: do not browse or read it; find only its alarm type, then propose with machineNode set to that node and elements empty.");
        mcp.DiscoveryFlow.Add("Every read and browse names its node ids (nodeId or nodeIds), from the namespace array, a browse or opcua_machine_list.");
        mcp.DiscoveryFlow.Add("A gateway serves several machines under one address: opcua_machine_list lists them, and each gets a proposal of its own with its machineNode.");
    })
    .WithOpcUaMcpFilters()
    .WithRequestFilters(filters => filters.AddCallToolFilter(ScanConnect.Filter))
    .WithOpcUaCoreTools(McpToolProfile.Services)
    .WithPleiadesToolsFromAssembly();
builder.Services.PostConfigure<McpServerOptions>(UaToolCatalogue.Apply);

builder.Services.AddHealthChecks()
    .AddMqtt();

var app = builder.Build();

// The OPC UA MCP library gives a session to an identified caller only. The demo has no sign-in, as
// the other services have none: every request to /mcp is the one caller of the demo network. Behind
// a sign-in, the authenticated principal takes this place.
var demoCaller = new ClaimsPrincipal(new ClaimsIdentity(
    [new Claim(ClaimTypes.NameIdentifier, "demo", ClaimValueTypes.String, "urn:pleiades:playground:demo-network")],
    authenticationType: "DemoNetwork"));
app.Use((context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/mcp", StringComparison.Ordinal) && context.User.Identity?.IsAuthenticated != true)
    {
        context.User = demoCaller;
    }

    return next(context);
});

app.MapPleiadesHealthChecks();
app.MapOpenApi();
app.MapMachineEndpoints();
app.MapPleiadesMcp();

var logger = app.Services.GetRequiredService<ILogger<Program>>();
var config = app.Services.GetRequiredService<IOptions<Config>>();

logger.LogConfiguration(
    config.Value,
    redactor => redactor
        .Redact(c => c.MqttDestination.ConnectionString, BuiltInRedactors.MqttUri)
        .Redact(c => c.MqttDestination.User, BuiltInRedactors.MaskAll)
        .Redact(c => c.MqttDestination.Password, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Username, BuiltInRedactors.MaskAll)
        .RedactEach(c => c.Loki.Sinks, s => s.BasicAuth!.Password, BuiltInRedactors.MaskAll));

await app.RunAsync().ConfigureAwait(false);
