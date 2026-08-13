namespace App.Domain;

// @adr 010 - the Note demo domain
/// <summary>
/// The Note entity's single source of shape (§12.2): the record IS the model, the
/// response body and the row the adapter persists. Id and createdAt arrive stamped
/// by the caller — the domain owns no clock and no id generator.
/// </summary>
public sealed record Note(Guid Id, string Text, DateTimeOffset CreatedAt);
