using System.Text.Json.Nodes;
using App.Tests.Harness;
using App.Tests.Slices;
using Xunit;

namespace App.Tests.E2E;

// Docs example capture (BR-26): replays the harness scenarios and writes each
// exchange to docs/api/<operationId>/examples/<case-id>.json. Same pinned clock
// and ids as the conformance run, so reruns are byte-identical. Run through
// `pnpm docs:examples`, which re-pins the .examples.lock afterwards.
[Trait("Category", "capture")]
public sealed class CaptureTest : IClassFixture<SliceAppFactory>
{
    private readonly SliceAppFactory factory;

    public CaptureTest(SliceAppFactory factory)
    {
        this.factory = factory;
    }

    [Fact]
    public async Task CapturesEveryHarnessScenario()
    {
        using var client = factory.CreateClient();
        HarnessSeed.Seed(factory.Repository);
        factory.Ids.Reset();
        var root = RepoRoot.Find();
        foreach (var harnessCase in HarnessCases.CASES)
        {
            var (status, contentType, body) = await Replay.Execute(client, harnessCase);
            var directory = Path.Combine(root, "docs", "api", harnessCase.OperationId, "examples");
            Directory.CreateDirectory(directory);
            await File.WriteAllTextAsync(
                Path.Combine(directory, harnessCase.Id + ".json"),
                CanonicalJson.Write(Example(harnessCase, status, contentType, body)));
        }
    }

    private static JsonObject Example(HarnessCase harnessCase, int status, string contentType, string body)
    {
        var request = new JsonObject
        {
            ["method"] = harnessCase.Method,
            ["path"] = harnessCase.Path,
        };
        if (harnessCase.Body is not null)
        {
            request["body"] = JsonNode.Parse(harnessCase.Body);
        }
        return new JsonObject
        {
            ["request"] = request,
            ["response"] = new JsonObject
            {
                ["status"] = status,
                ["headers"] = new JsonObject { ["content-type"] = contentType },
                ["body"] = body.Length == 0 ? null : JsonNode.Parse(body),
            },
        };
    }
}
