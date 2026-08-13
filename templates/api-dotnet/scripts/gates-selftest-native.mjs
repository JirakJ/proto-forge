import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fail, ok, note } from "./lib.mjs";

// @adr 003 - gates:selftest Tier 2: the NATIVE halves get a demonstrated failure too
//
// Tier 1 proves every .mjs gate on fixture directories, toolchain-free. The
// claims the .NET toolchain enforces - ArchUnitNET rejects an illegal namespace
// dependency, coverlet's Threshold rejects an uncovered branch, EF Core rejects
// a model the committed migrations never produced - need a real `dotnet` build
// to fail, so this tier builds THROWAWAY projects outside the repository and
// asserts the exit codes. CI-only by placement (minutes, not seconds - the
// verify-template precedent, BRS §18/§19); the migration case additionally needs
// Docker and is tool-gated locally exactly like the native test tier.

const results = [];
const has = (cmd) => spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;

if (!has("dotnet")) {
  if (process.env.CI) {
    fail("gates:selftest:native FAILED", ["dotnet is not installed in CI - Tier 2 is mandatory there"]);
  }
  note("gates:selftest:native SKIPPED - the .NET SDK is not installed (CI enforces)");
  process.exit(0);
}

// Package versions are the ones the template itself pins (App.Tests.csproj /
// App.csproj): a fixture that proved a DIFFERENT toolchain would prove nothing
// about this one.
const XUNIT = "2.9.3";
const XUNIT_RUNNER = "3.1.5";
const TEST_SDK = "18.8.1";
const COVERLET = "10.0.1";
const ARCHUNIT = "0.13.3";
const EF_POSTGRES = "10.0.3";
const TESTCONTAINERS = "4.13.0";

// The throwaway lives in the OS temp dir, so it inherits neither global.json nor
// Directory.Build.props - the fixture states its own contract in full.
const TEST_PROJECT = (packages, properties = "") => `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <IsPackable>false</IsPackable>
${properties}  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="${TEST_SDK}" />
    <PackageReference Include="xunit" Version="${XUNIT}" />
    <PackageReference Include="xunit.runner.visualstudio" Version="${XUNIT_RUNNER}" PrivateAssets="all" />
${packages}  </ItemGroup>
</Project>
`;

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), "proto-forge-native-"));
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

function dotnet(dir, args) {
  const r = spawnSync("dotnet", args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC", DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" },
    timeout: 20 * 60 * 1000,
  });
  return { code: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function expectBuild(name, files, args, { pass, matching }) {
  const dir = project(files);
  try {
    const { code, out } = dotnet(dir, args);
    const passed = code === 0;
    if (passed !== pass) {
      results.push(`${name}: expected ${pass ? "PASS" : "FAIL"}, got ${passed ? "PASS" : "FAIL"} - ${out.trim().slice(-800)}`);
    } else if (matching !== undefined && !matching.test(out)) {
      results.push(`${name}: correct verdict but the output does not mention ${matching} - ${out.trim().slice(-800)}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- 1. ArchUnitNET fires: an illegal domain dependency fails the suite --------
expectBuild(
  "native-arch: a domain class depending on a forbidden namespace fails the ArchUnitNET suite",
  {
    "Fixture.csproj": TEST_PROJECT(
      `    <PackageReference Include="TngTech.ArchUnitNET.xUnit" Version="${ARCHUNIT}" />\n`,
    ),
    "Domain/Bad.cs":
      "using System.Data.Common;\n\nnamespace Fixture.Domain;\n\npublic sealed class Bad\n{\n"
      + "    public DbConnection? Connection { get; init; }\n}\n",
    "ArchTest.cs": `using ArchUnitNET.Domain;
using ArchUnitNET.Loader;
using ArchUnitNET.xUnit;
using Xunit;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

namespace Fixture;

public sealed class ArchTest
{
    private static readonly Architecture Architecture =
        new ArchLoader().LoadAssembly(typeof(Fixture.Domain.Bad).Assembly).Build();

    [Fact]
    public void DomainIsFrameworkFree()
    {
        Types().That().ResideInNamespaceMatching("^Fixture\\\\.Domain($|\\\\.)")
            .Should().NotDependOnAnyTypesThat().ResideInNamespaceMatching("^System\\\\.Data($|\\\\.)")
            .Check(Architecture);
    }
}
`,
  },
  ["test", "--nologo"],
  { pass: false, matching: /DomainIsFrameworkFree|System\.Data\.Common/ },
);

// --- 2. coverlet's Threshold fires: an uncovered branch fails the unit tier ----
expectBuild(
  "native-coverage: an uncovered branch fails the 100 coverlet threshold",
  {
    "Fixture.csproj": TEST_PROJECT(
      `    <PackageReference Include="coverlet.msbuild" Version="${COVERLET}" PrivateAssets="all" />\n`,
      "    <Include>[Fixture]Fixture.Core.*</Include>\n"
        + "    <Threshold>100</Threshold>\n"
        + "    <ThresholdType>line,branch,method</ThresholdType>\n"
        + "    <ThresholdStat>total</ThresholdStat>\n",
    ),
    "Core/Branchy.cs":
      "namespace Fixture.Core;\n\npublic static class Branchy\n{\n    public static int F(bool flag)\n    {\n"
      + "        return flag ? 1 : 2;\n    }\n}\n",
    "BranchyTest.cs": `using Fixture.Core;
using Xunit;

namespace Fixture;

public sealed class BranchyTest
{
    [Fact]
    public void CoversOnlyOneSide()
    {
        Assert.Equal(1, Branchy.F(true));
    }
}
`,
  },
  ["test", "--nologo", "-p:CollectCoverage=true"],
  { pass: false, matching: /threshold|branch/i },
);

// --- 3. EF Core fires: a drifted model fails against a real engine -------------
// Needs Docker (a real Postgres, BRS §15). Tool-gated locally; mandatory in CI.
const dockerReady = has("docker") && spawnSync("docker", ["info"], { stdio: "ignore" }).status === 0;

if (!dockerReady && !process.env.CI) {
  note("native-migrate: Docker not available - skipping locally (CI runs this tier with Docker)");
} else if (!dockerReady) {
  results.push("native-migrate: Docker not available in CI - the real-engine tier is mandatory there");
} else {
  expectBuild(
    "native-migrate: a model the committed migrations never produced fails against a real Postgres",
    {
      "Fixture.csproj": TEST_PROJECT(
        `    <PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="${EF_POSTGRES}" />\n`
          + `    <PackageReference Include="Testcontainers.PostgreSql" Version="${TESTCONTAINERS}" />\n`,
      ),
      // The context declares a column the single committed migration never
      // creates - exactly the drift `dotnet ef migrations add` exists to prevent.
      "NotesDbContext.cs": `using Microsoft.EntityFrameworkCore;

namespace Fixture;

public sealed class NoteRow
{
    public Guid Id { get; set; }
    public string Text { get; set; } = "";
    public string Author { get; set; } = "";
}

public sealed class NotesDbContext(DbContextOptions<NotesDbContext> options) : DbContext(options)
{
    public DbSet<NoteRow> Notes => Set<NoteRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<NoteRow>().ToTable("notes");
    }
}
`,
      "InitialMigration.cs": `using Microsoft.EntityFrameworkCore.Migrations;

namespace Fixture;

[Microsoft.EntityFrameworkCore.Migrations.Migration("00000000000001_Notes")]
[Microsoft.EntityFrameworkCore.Infrastructure.DbContext(typeof(NotesDbContext))]
public sealed class InitialMigration : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("CREATE TABLE notes (id uuid PRIMARY KEY, text text NOT NULL);");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("DROP TABLE notes;");
    }
}
`,
      "MigrateTest.cs": `using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace Fixture;

public sealed class MigrateTest : IAsyncLifetime
{
    private readonly PostgreSqlContainer postgres = new PostgreSqlBuilder("postgres:16-alpine").Build();

    public Task InitializeAsync()
    {
        return postgres.StartAsync();
    }

    public Task DisposeAsync()
    {
        return postgres.DisposeAsync().AsTask();
    }

    [Fact]
    public void TheModelMustBeWhatTheMigrationsProduce()
    {
        var options = new DbContextOptionsBuilder<NotesDbContext>()
            .UseNpgsql(postgres.GetConnectionString())
            .Options;
        using var context = new NotesDbContext(options);
        context.Database.Migrate();
        // The history applied cleanly; the model still asks for a column no
        // migration ever created, so the read against the real schema throws.
        context.Notes.ToList();
    }
}
`,
    },
    ["test", "--nologo"],
    { pass: false, matching: /42703|does not exist|PostgresException/i },
  );
}

if (results.length) fail(`gates:selftest:native FAILED (${results.length})`, results);
ok("gates:selftest:native: ArchUnitNET, the coverlet threshold and EF Core's model agreement each reject what they claim to reject");
