package app.adapters.out.persistence

import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import org.jetbrains.exposed.v1.core.Column
import org.jetbrains.exposed.v1.core.ColumnType
import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.core.java.javaUUID

// @adr 022 - the Exposed table behind the Note repository port
//
// Mirrors src/main/resources/db/migration/V0001__notes.sql - migration:verify
// holds the two together at name level (BR-24), and the native tier proves the
// full agreement by running Flyway and then reading the live catalog back. The
// table never invents a column the migrations do not produce.
public object NotesTable : Table("notes") {

    public val id: Column<UUID> = javaUUID("id")
    public val text: Column<String> = text("text")
    public val createdAt: Column<Instant> = registerColumn("created_at", TimestampTzColumnType())

    override val primaryKey: PrimaryKey = PrimaryKey(id)
}

/**
 * `timestamptz` <-> [Instant]. Exposed ships its java.time column extensions in a
 * separate module; the dependency budget (ADR 007) buys the Ktor and Exposed
 * cores, not a module for one column, so the mapping is stated here - twenty
 * lines of adapter, proven end to end by the native persistence tier.
 */
internal class TimestampTzColumnType : ColumnType<Instant>() {

    override fun sqlType(): String = "TIMESTAMP WITH TIME ZONE"

    override fun valueFromDB(value: Any): Instant = when (value) {
        is Instant -> value
        is OffsetDateTime -> value.toInstant()
        is java.sql.Timestamp -> value.toInstant()
        else -> throw IllegalArgumentException("unexpected created_at value of type ${value::class.qualifiedName}")
    }

    override fun notNullValueToDB(value: Instant): Any = OffsetDateTime.ofInstant(value, ZoneOffset.UTC)

    override fun nonNullValueToString(value: Instant): String =
        "'${OffsetDateTime.ofInstant(value, ZoneOffset.UTC)}'"
}
