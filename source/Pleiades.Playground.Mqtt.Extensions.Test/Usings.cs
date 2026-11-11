global using Microsoft.VisualStudio.TestTools.UnitTesting;

[assembly: System.Diagnostics.CodeAnalysis.SuppressMessage("Usage", "CA2007", Justification = "Not production code.")]
[assembly: System.Diagnostics.CodeAnalysis.SuppressMessage("Design", "CA1515", Justification = "Test classes are public by convention.")]
[assembly: System.Diagnostics.CodeAnalysis.SuppressMessage("Naming", "CA1707", Justification = "Test methods use underscores for readability.")]
[assembly: System.Diagnostics.CodeAnalysis.SuppressMessage("Reliability", "CA2000", Justification = "The managed client under test owns the fake client and disposes it.")]
[assembly: System.Diagnostics.CodeAnalysis.SuppressMessage("Performance", "CA1861", Justification = "Not production code.")]
