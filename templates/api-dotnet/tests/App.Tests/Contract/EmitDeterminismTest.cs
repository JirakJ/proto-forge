using App.Adapters.In.Http;
using Xunit;

namespace App.Tests.Contract;

// BR-22's precondition: a contract that is a locked derivation must derive the
// SAME bytes every time. The emitter is a pure function of the route registry,
// and this pins that property where a refactor would first break it.
public sealed class EmitDeterminismTest
{
    [Fact]
    public void TwoEmitsAreByteIdentical()
    {
        Assert.Equal(OpenApiEmitter.Emit(), OpenApiEmitter.Emit());
    }

    [Fact]
    public void TheDocumentCarriesEveryRegistryOperation()
    {
        var document = OpenApiEmitter.Emit();
        foreach (var def in RouteRegistry.ROUTES)
        {
            Assert.Contains($"\"{def.OperationId}\"", document);
        }
    }
}
