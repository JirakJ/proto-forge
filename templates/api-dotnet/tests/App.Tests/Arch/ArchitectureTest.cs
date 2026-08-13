using System.Text.Json;
using System.Text.RegularExpressions;
using ArchUnitNET.Domain;
using ArchUnitNET.Loader;
using ArchUnitNET.xUnit;
using Xunit;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

namespace App.Tests.Arch;

// @adr 005 - the architecture profile is derived, recorded, and enforced (BR-21)
//
// The suite selects its active edge table from .proto-forge/architecture.json,
// never hardcoded: the record is written at generation time from the facets, and
// scripts/arch-verify.mjs re-derives it on every run. Three profiles ship as
// data; the recorded style picks one, and ArchUnitNET holds every layer's
// dependencies to exactly its edges. The .mjs gate re-proves the same tables
// standalone (using-directive scan), so BR-21 does not depend on the dotnet
// toolchain alone - and this suite closes the gap the scan cannot see (implicit
// usings, fully-qualified references).
public sealed class ArchitectureTest
{
    private static readonly Architecture Architecture =
        new ArchLoader().LoadAssembly(typeof(App.Domain.Note).Assembly).Build();

    private const string Domain = "App.Domain";
    private const string Application = "App.Application";
    private const string AdapterIn = "App.Adapters.In";
    private const string AdapterOut = "App.Adapters.Out";
    private const string Platform = "App.Platform";
    private const string Config = "App.Config";

    private static readonly string[] AllElements = [Domain, Application, AdapterIn, AdapterOut, Platform, Config];

    // element -> the app namespaces it may depend on, per profile. The SAME edge
    // tables as scripts/arch-verify.mjs, duplicated as data on purpose: the gate
    // proves them without the dotnet toolchain, this suite proves them against
    // the compiled assembly.
    private static readonly IReadOnlyDictionary<string, IReadOnlyDictionary<string, string[]>> EDGES =
        new Dictionary<string, IReadOnlyDictionary<string, string[]>>
        {
            ["layered"] = new Dictionary<string, string[]>
            {
                [Domain] = [Domain],
                [Application] = [Application, Domain, Platform],
                [AdapterIn] = [AdapterIn, Application, Domain, Platform, Config],
                [AdapterOut] = [AdapterOut, Application, Domain, Platform, Config],
                [Platform] = [Platform],
                [Config] = [Config],
            },
            ["modular"] = new Dictionary<string, string[]>
            {
                [Domain] = [Domain],
                [Application] = [Application, Domain, Platform],
                [AdapterIn] = [AdapterIn, Application, Domain, Platform, Config],
                [AdapterOut] = [AdapterOut, Application, Domain, Platform, Config],
                [Platform] = [Platform],
                [Config] = [Config],
            },
            ["hexagonal"] = new Dictionary<string, string[]>
            {
                [Domain] = [Domain],
                [Application] = [Application, Domain, Platform],
                // Strict profile: an inbound adapter may not import an outbound
                // one or vice versa - everything crosses through the ports.
                [AdapterIn] = [AdapterIn, Application, Domain, Platform, Config],
                [AdapterOut] = [AdapterOut, Application, Domain, Platform, Config],
                [Platform] = [Platform],
                [Config] = [Config],
            },
        };

    // Which external namespace prefixes each element may see. DataAnnotations is
    // ALLOWED in the domain - the constraints ARE the schema (BRS §12.2), and the
    // namespace is BCL-only. The platform kernel additionally sees the hosting
    // framework: it owns the framework-integration surface (problem middleware,
    // security headers, health) per BRS §16, and it is byte-pinned.
    private static readonly IReadOnlyDictionary<string, string[]> EXTERNALS = new Dictionary<string, string[]>
    {
        [Domain] = ["System"],
        [Application] = ["System"],
        [Platform] = ["System", "Microsoft"],
        [Config] = ["System", "Microsoft.Extensions"],
        [AdapterIn] = ["*"],
        [AdapterOut] = ["*"],
    };

    private static string ActiveStyle()
    {
        var record = Path.Combine(E2E.RepoRoot.Find(), ".proto-forge/architecture.json");
        using var parsed = JsonDocument.Parse(File.ReadAllText(record));
        return parsed.RootElement.GetProperty("style").GetString()
            ?? throw new InvalidOperationException(record + " records no style");
    }

    private static string NamespacePattern(IEnumerable<string> prefixes)
    {
        return "^(" + string.Join("|", prefixes.Select(Regex.Escape)) + @")(\..*)?$";
    }

    [Fact]
    public void EveryLayerFollowsTheActiveProfilesEdges()
    {
        var style = ActiveStyle();
        Assert.True(EDGES.ContainsKey(style), $"no edge table for style \"{style}\" - a missing profile makes the derivation unenforceable");
        foreach (var (element, allowed) in EDGES[style])
        {
            var externals = EXTERNALS[element];
            if (externals.Contains("*"))
            {
                // Free externals: only the app-internal edges are constrained.
                var forbidden = AllElements.Except(allowed).ToArray();
                if (forbidden.Length == 0)
                {
                    continue;
                }
                Types().That().ResideInNamespaceMatching(NamespacePattern([element]))
                    .Should().NotDependOnAnyTypesThat().ResideInNamespaceMatching(NamespacePattern(forbidden))
                    .Because($"the \"{style}\" profile does not allow {element} to reach {string.Join(", ", forbidden)} (BR-21)")
                    .Check(Architecture);
                continue;
            }
            Types().That().ResideInNamespaceMatching(NamespacePattern([element]))
                .Should().OnlyDependOnTypesThat().ResideInNamespaceMatching(NamespacePattern(allowed.Concat(externals)))
                .Because($"{element} may only see [{string.Join(", ", allowed.Concat(externals))}] under the \"{style}\" profile (BR-21)")
                .Check(Architecture);
        }
    }

    [Fact]
    public void TheDomainStaysFrameworkFreeInEveryProfile()
    {
        Types().That().ResideInNamespaceMatching(NamespacePattern([Domain]))
            .Should().NotDependOnAnyTypesThat().ResideInNamespaceMatching(NamespacePattern(["Microsoft", "Npgsql"]))
            .Because("the domain layer is framework-pure in every profile (BR-21, §13)")
            .Check(Architecture);
    }
}
