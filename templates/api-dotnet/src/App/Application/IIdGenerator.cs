namespace App.Application;

/// <summary>Injected id source: production wires Guid.NewGuid, tests a counter.</summary>
public interface IIdGenerator
{
    Guid Next();
}
