using System.ComponentModel.DataAnnotations;

namespace App.Domain;

/// <summary>
/// The create payload. The annotations ARE the schema (§12.2, the C# analogue of
/// a zod schema): System.ComponentModel.DataAnnotations is BCL-only and I/O-free,
/// so the domain stays framework-pure while carrying its own validation (BR-21).
/// The error messages are pinned here so the "validation-failed" problem detail
/// is deterministic and the captured docs examples stay byte-stable (BR-26).
/// </summary>
public sealed record NoteCreate(
    [property: Required(AllowEmptyStrings = false, ErrorMessage = "must not be blank")]
    [property: StringLength(2000, ErrorMessage = "must be at most 2000 characters")]
    string Text);
