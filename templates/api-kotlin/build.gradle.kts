import info.solidsoft.gradle.pitest.PitestTask

plugins {
    kotlin("jvm") version "2.2.21"
    kotlin("plugin.serialization") version "2.2.21"
    application
    jacoco
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
    id("info.solidsoft.pitest") version "1.19.0"
}

group = "app"
version = "0.1.0"

val ktorVersion = "3.2.4"
val exposedVersion = "1.0.0-beta-5"

kotlin {
    jvmToolchain(21)
}

dependencyLocking {
    lockAllConfigurations()
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("io.ktor:ktor-server-netty:$ktorVersion")
    implementation("io.ktor:ktor-server-status-pages:$ktorVersion")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
    implementation("org.jetbrains.exposed:exposed-core:$exposedVersion")
    implementation("org.jetbrains.exposed:exposed-jdbc:$exposedVersion")
    implementation("com.zaxxer:HikariCP:7.0.2")
    implementation("org.flywaydb:flyway-database-postgresql:11.14.0")
    runtimeOnly("org.postgresql:postgresql:42.7.12")
    runtimeOnly("ch.qos.logback:logback-classic:1.5.20")

    testImplementation(kotlin("test"))
    testImplementation("io.ktor:ktor-server-test-host:$ktorVersion")
    testImplementation("com.tngtech.archunit:archunit:1.5.0")
    testImplementation(platform("org.junit:junit-bom:5.13.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

application {
    mainClass = "app.MainKt"
}

tasks.test {
    useJUnitPlatform()
}
