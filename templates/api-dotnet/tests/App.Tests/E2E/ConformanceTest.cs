using App.Tests.Harness;
using App.Tests.Slices;
using Xunit;

namespace App.Tests.E2E;

// @adr 003 - the e2e conformance run (test:e2e is the last verify step)
//
// Replays every harness scenario against the booted in-memory test host and
// holds each response to the registry's own declarations - status, problem
// codes, shape. This is the pass/fail gate OUTSIDE the coverage percentage: the
// wiring, the registrar and the kernel middleware are proven by exercising
// them, not by counting their lines.
[Trait("Category", "conformance")]
public sealed class ConformanceTest : IClassFixture<SliceAppFactory>
{
    private readonly SliceAppFactory factory;

    public ConformanceTest(SliceAppFactory factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task EveryHarnessScenarioConformsToTheRegistry()
    {
        using var client = factory.CreateClient();
        HarnessSeed.Seed(factory.Repository);
        factory.Ids.Reset();
        var failures = new List<string>();
        foreach (var harnessCase in HarnessCases.CASES)
        {
            var (status, _, body) = await Replay.Execute(client, harnessCase);
            failures.AddRange(Conformance.Check(harnessCase, status, body));
        }
        Assert.True(failures.Count == 0, "conformance failures:\n" + string.Join("\n", failures));
        // The machine fact for quality:report (BR-36): scripts/e2e-conformance.mjs
        // reads this line from build/conformance-summary.txt (the test host's
        // stdout does not reliably reach the runner) and records
        // .proto-forge/e2e-results.json from it — the documented status is a
        // derivation of THIS run, never a typed claim.
        var summary = $"conformance: {HarnessCases.CASES.Count} scenarios green\n";
        var root = RepoRoot.Find();
        Directory.CreateDirectory(Path.Combine(root, "build"));
        await File.WriteAllTextAsync(Path.Combine(root, "build", "conformance-summary.txt"), summary);
        Console.WriteLine(summary);
    }
}
