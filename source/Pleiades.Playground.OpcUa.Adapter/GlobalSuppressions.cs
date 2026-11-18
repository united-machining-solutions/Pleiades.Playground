using System.Diagnostics.CodeAnalysis;

// An OPC UA endpoint is an opc.tcp address and a security policy is named by a URI. Both are
// identifiers that the OPC UA stack takes and gives as text, and that a registration stores as text.
[assembly: SuppressMessage("Design", "CA1054:URI-like parameters should not be strings", Justification = "OPC UA addresses and policy URIs are text in the stack and in a registration.")]
[assembly: SuppressMessage("Design", "CA1055:URI-like return values should not be strings", Justification = "OPC UA addresses and policy URIs are text in the stack and in a registration.")]
[assembly: SuppressMessage("Design", "CA1056:URI-like properties should not be strings", Justification = "OPC UA addresses and policy URIs are text in the stack and in a registration.")]
