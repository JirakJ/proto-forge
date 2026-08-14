package app.domain.note

import java.time.Instant
import java.util.UUID
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.descriptors.element
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.encoding.encodeStructure
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

// @adr 010 - the Note slice's wire schema, in one place
//
// The whole serialization surface of this domain lives here: the two scalars,
// the required-member rule, and one `KSerializer` per type. Written out rather
// than generated (ADR 003): a `@Serializable` class whose properties carry no
// defaults makes the compiler emit a missing-field branch that no kotlinx
// decoder can reach - dead bytecode inside the behavioural core, where the
// coverage floor is 1.00. Writing it by hand removes that, and it earns its keep
// twice over, because the element order, the scalar formats and the rejection
// message for an incomplete document all become declarations a reviewer can read
// instead of compiler output nobody sees. Keeping them together is also what
// keeps the entity files down to their shape: one import block, not four.
//
// kotlinx.serialization is a codec and a descriptor model with no I/O, so the
// domain stays framework-pure (BR-21), and the descriptor IS what the OpenAPI
// emitter reads (ADR 008).

/** `java.util.UUID` as an RFC 4122 string; the serialName is the contract's `format: uuid`. */
public object UuidSerializer : KSerializer<UUID> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("java.util.UUID", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: UUID) {
        encoder.encodeString(value.toString())
    }

    override fun deserialize(decoder: Decoder): UUID = UUID.fromString(decoder.decodeString())
}

/** `java.time.Instant` as an ISO-8601 instant in UTC; the serialName is `format: date-time`. */
public object InstantSerializer : KSerializer<Instant> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("java.time.Instant", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Instant) {
        encoder.encodeString(value.toString())
    }

    override fun deserialize(decoder: Decoder): Instant = Instant.parse(decoder.decodeString())
}

/**
 * The one place an incoming document is checked for a member it must carry. The
 * serializers below read the parsed document themselves rather than leaning on a
 * decoder's own required-element handling, so "which field is missing" is a
 * message this template owns - and one its tests can reach, which is what keeps
 * the behavioural core honestly at the 1.00 floor (ADR 003).
 */
internal fun JsonObject.requiredString(field: String, type: String): String {
    val value = this[field]
        ?: throw SerializationException("Field '$field' is required for type $type, but it was missing")
    return value.jsonPrimitive.content
}

/** [Note]'s wire schema: element order, formats and the rejection an incomplete document earns. */
public object NoteSerializer : KSerializer<Note> {

    private const val SERIAL_NAME = "app.domain.note.Note"
    private const val ID = 0
    private const val TEXT = 1
    private const val CREATED_AT = 2

    override val descriptor: SerialDescriptor = buildClassSerialDescriptor(SERIAL_NAME) {
        element("id", UuidSerializer.descriptor)
        element<String>("text")
        element("createdAt", InstantSerializer.descriptor)
    }

    override fun serialize(encoder: Encoder, value: Note) {
        encoder.encodeStructure(descriptor) {
            encodeSerializableElement(descriptor, ID, UuidSerializer, value.id)
            encodeStringElement(descriptor, TEXT, value.text)
            encodeSerializableElement(descriptor, CREATED_AT, InstantSerializer, value.createdAt)
        }
    }

    /** JSON is the only wire format this service speaks, which the cast states rather than hides. */
    override fun deserialize(decoder: Decoder): Note {
        val document = (decoder as JsonDecoder).decodeJsonElement().jsonObject
        return Note(
            UUID.fromString(document.requiredString("id", SERIAL_NAME)),
            document.requiredString("text", SERIAL_NAME),
            Instant.parse(document.requiredString("createdAt", SERIAL_NAME)),
        )
    }
}

/** [NoteCreate]'s wire schema, hand-written for the reason stated at the top of this file. */
public object NoteCreateSerializer : KSerializer<NoteCreate> {

    private const val SERIAL_NAME = "app.domain.note.NoteCreate"
    private const val TEXT = 0

    override val descriptor: SerialDescriptor = buildClassSerialDescriptor(SERIAL_NAME) {
        element<String>("text")
    }

    override fun serialize(encoder: Encoder, value: NoteCreate) {
        encoder.encodeStructure(descriptor) {
            encodeStringElement(descriptor, TEXT, value.text)
        }
    }

    override fun deserialize(decoder: Decoder): NoteCreate {
        val document = (decoder as JsonDecoder).decodeJsonElement().jsonObject
        return NoteCreate(document.requiredString("text", SERIAL_NAME))
    }
}
