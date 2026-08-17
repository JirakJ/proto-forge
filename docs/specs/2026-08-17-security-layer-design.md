# proto-forge — design: security layer (ASVS 5.0 L2 / SLSA B3 / SSDF)

- Status: proposed
- Date: 2026-08-17
- Extends: docs/specs/2026-08-13-v0.6.0-design.md
- Register space: **§25**, rules **BR-38 … BR-41**, **NFR-26 … NFR-28**, plugin ADR **013**

## Context

Šablony dnes bezpečnostní baseline **mají** — strict CSP, `SafeHtml` jako jediný vstup raw HTML,
zod na hranicích, gitleaks, `pnpm audit --prod` jako hard-stop, deterministický CycloneDX SBOM,
byte-pinned seed, digest-pinned non-root kontejnery, cosign keyless, trivy, `deploy:verify` offline.
Je to poctivá vrstva a je vynucená gaty, ne pamětí revieweru.

Chybí jí tři věci, a všechny tři plynou z jedné příčiny — **baseline je definovaná sama sebou**:

1. **Žádný pojmenovaný externí standard.** Grep na `OWASP|ASVS|SLSA|SSDF|NIST|CIS` napříč repem
   vrací nulu. Nikde není řečeno *„splňujeme X verze Y úrovně Z"*, takže „je to bezpečné" nelze
   nikomu předat jako tvrzení, které si ověří.
2. **Žádný reprodukovatelný důkaz.** `sec:scan` vypíše `ok` na stdout a skončí. Jediný artefakt,
   který po roce vznikne znovu stejný, je SBOM.
3. **Triáž se nedostane ke skeneru, který běží.** Doloženo v praxi při psaní tohoto designu:
   `desktop-tauri/src-tauri/audit.toml` nese sedmnáct RUSTSEC nálezů řádně otriážovaných
   s důvodem i expirací — a osv-scanner o nich nevěděl, protože čte jiný soubor. Opraveno
   commitem `68b971e`; **tenhle případ je vzor pro celou vrstvu**, ne výjimka.

Nález, který stojí za zaznamenání: při ověřování byla `pnpm verify` **červená na `main`** —
`e0be82a` zdvojil export v `packages/proto-ui/src/index.ts`, čímž rozešel byte-pinned seed
(a rozbil typecheck seedu). Seed pin to zachytil správně; commitnuto to bylo přesto. Opraveno
v `960651d`. Je to argument pro §25: kontrola, jejíž výsledek nikde nezůstane zapsaný, se
přehlédne i když funguje.

## Fixní rozhodnutí uživatele

| Otázka | Rozhodnutí |
| --- | --- |
| Rozsah | **Všech 10 šablon** — vrstva žije v generovaných aplikacích; plugin sám zůstává u svých gatů |
| Standard | **OWASP ASVS 5.0 Level 2** jako závazná aplikační laťka, **SLSA v1.1 Build L3** pro dodavatelský řetězec, **NIST SSDF SP 800-218** jako procesní mapa, **NIST SP 800-190 / CIS Docker** pro kontejner |
| Úroveň | L2 default, **ratchet na L3** profilem v `.proto-forge/config.json`; pod L2 jen přes waiver s ADR a expirací (BR-17) |
| Reprodukce | **Regenerace + diff jako gate** (mechanika `snapshot:diff`), nálezy do **SARIF**, při releasu **SLSA provenance** podepsaná cosignem keyless |

## Proč zrovna tenhle set

ASVS je jediný široce přijatý standard, který dává *číslované, ověřitelné* aplikační požadavky
(V1–V17) místo obecných zásad — což je přesně podmínka „jasně definovaný standard poskytující
reprodukovatelný výstup". L2 je autorská doporučená laťka pro aplikace zpracovávající citovaná
data; L3 žádá věci, které prototyp nemůže poctivě tvrdit (HSM, segregace prostředí, formální
threat model per feature) a jejich hromadné odbytí přes „N/A" by výrok o shodě oslabilo víc,
než kolik by přidalo. Proto L2 jako laťka a L3 jako ratchet pro projekt, který na něj dosáhne.

SLSA a SSDF pokrývají to, co ASVS z principu neřeší — jak artefakt vznikl. Většina SLSA B3
v repu **už existuje** (digest piny, keyless podpis, ověření identity workflow před deployem);
chybí generovaná a ověřovaná provenance. SSDF není nic, co by se vynucovalo skriptem — je to
mapa, která existující gaty pojmenuje jazykem, kterým se ptá auditor.

## Architektura vrstvy

Pět částí. Katalog je normativní, sondy jsou důkaz, kotvy dělají kontrolu dohledatelnou,
report je výstup a ledger drží potlačené nálezy poctivé.

```
references/standards/asvs-5.0.0.flat.json   VENDOROVANÝ STANDARD, sha-pinned  (plugin)
references/security-controls.json           katalog: požadavek → kontrola → důkaz
  │
  ├─ scripts/sec-conformance.mjs      sondy: přečti repo, vydej verdikt         (v každé šabloně)
  │    ├─ .proto-forge/security/conformance.json   TVRZENÍ — byte-reprodukovatelné
  │    └─ .proto-forge/security/findings.sarif     POZOROVÁNÍ — hlídané prahem
  │
  ├─ // @asvs V3.4.3 - …              kotva u kódu, ověřená proti katalogu
  └─ .proto-forge/security/suppressions.toml       ledger potlačení, renderovaný do dialektů
```

### 0. Vendorovaný standard (`references/standards/asvs-5.0.0.flat.json`)

ASVS 5.0 vydává OWASP **strojově čitelně** — 345 požadavků, každý s `req_id`, `chapter_id`,
`section_id`, textem a úrovní `L`. Katalog proto čísla **nepřepisuje**, jen na ně odkazuje,
a `security:catalogue` ověří, že každý citovaný `req_id` v souboru existuje a má úroveň, kterou
katalog tvrdí — přesně jako `citations` rozřešuje `BR-xx` proti registru. Přepsaný standard je
standard, který se rozejde; odkazovaný ne.

Soubor se vendoruje z **`v5.0.0_release`** (2025-05-30), nikdy z tagu `latest`. `latest` je
rolling „Bleeding Edge" release — dnes je jeho obsah s vydanou 5.0.0 shodou okolností
byte-identický (`sha256 8201b20eec2908c3380ac600c91c8ba746346fbb808859366abb232027532311`),
ale to je stav okamžiku, ne záruka. Připíná se tag i sha256; upgrade standardu je ADR.

Ověřený rozsah pro kalibraci: L1 = 70, L2 = 183, L3 = 92 požadavků. **Závazná laťka L2 je
L1 ∪ L2 = 253 požadavků**, z nichž velká část je pro daný brief neaplikovatelná
(V17 WebRTC vždy; V10 OAuth a V5 File Handling pokud je brief nežádá) — o tom rozhoduje
`whenFacet`, ne úvaha.

### 1. Katalog kontrol (`references/security-controls.json`)

Jediný zdroj (BR-15). Každá položka váže požadavek standardu na konkrétní kontrolu a na
enforcer, který ji dokazuje:

```json
{
  "standards": {
    "asvs": {
      "name": "OWASP ASVS", "version": "5.0.0", "tag": "v5.0.0_release",
      "vendored": "references/standards/asvs-5.0.0.flat.json",
      "sha256": "8201b20eec2908c3380ac600c91c8ba746346fbb808859366abb232027532311"
    },
    "slsa": { "name": "SLSA", "version": "1.1" },
    "ssdf": { "name": "NIST SSDF", "version": "SP 800-218 1.1" }
  },
  "controls": [
    {
      "id": "SEC-012",
      "title": "Untrusted HTML is sanitized by one library at one sink",
      "requires": [{ "standard": "asvs", "req": "V1.3.1" }],
      "maps": [{ "standard": "ssdf", "practice": "PW.5.1" }],
      "appliesTo": { "kinds": ["frontend", "desktop"] },
      "control": "src/shared/SafeHtml.tsx (DOMPurify); react/no-danger + no-unsanitized/* ban it elsewhere",
      "probe": "safeHtmlIsSoleSink",
      "evidence": { "gate": "lint", "selftest": "sec: a second raw-HTML sink fails" },
      "rule": "BR-38"
    }
  ]
}
```

Úroveň se v katalogu **neuvádí** — je vlastností požadavku ve vendorovaném standardu a duplikovat
ji sem by znamenalo druhý zdroj pravdy, který se rozejde. `appliesTo` váže na `kind` z registru
šablon nebo na konkrétní `id`; volitelný `whenFacet` (`authModel != none`, `persistence == api`)
rozhoduje o *aplikovatelnosti* podle briefu — to je mechanismus, kterým se `not-applicable` stává
odvozeným faktem, ne názorem.

### 2. Sondy (`scripts/sec-conformance.mjs`, v každé šabloně)

Sonda je **čistá funkce obsahu repa → verdikt**. Žádná síť, žádný čas, žádné proměnné prostředí
(NFR-16). Slovník verdiktů je záměrně tříprvkový:

| Verdikt | Kdy |
| --- | --- |
| `pass` | sonda kontrolu našla a je v pořádku |
| `fail` | sonda kontrolu nenašla nebo je porušená |
| `not-applicable` | `whenFacet` kontrolu vylučuje pro tento brief |

**Není `unknown`.** Požadavek, který nejde sondovat, do katalogu nepatří — a když do něj patřit
musí (ASVS má požadavky procesní povahy, např. threat model), váže se na *artefakt*, jehož
existence a tvar sondovat jde: `docs/THREAT-MODEL.md` s povinnými sekcemi a pokrytím každého
`flows[]` záznamu. Tím se „máme threat model" stává tvrzením, které padá, když dokument chybí
nebo zaostal za briefem.

### 3. Reprodukovatelný výstup

**`conformance.json`** je tvrzení a je byte-reprodukovatelné, protože se odvozuje výhradně
z obsahu repa. Determinismus není vedlejší efekt, je to vlastnost vynucená pravidly:

- položky řazené podle `id`; žádné mapy se závislým pořadím klíčů
- žádné timestampy, žádné absolutní cesty, žádné verze nástrojů, které se hýbou
- nese: verze standardů, profil (L2/L3), per-kontrola verdikt + ukazatel na důkaz, souhrn
- `digest` = sha256 kanonického těla; **ten se zapisuje do `.proto-forge/snapshot.json`**

**`findings.sarif`** (SARIF 2.1.0) je pozorování — gitleaks, osv/audit, SAST per stack.
Reprodukovatelné být nemůže a **nesmí předstírat, že je**: CVE databáze se hýbou, takže stejný
commit dá za týden jiný výsledek. Hlídá se prahem (high/critical = hard-stop, beze změny),
ne hashem. V CI se nahrává do GitHub Security tabu.

Toto rozdělení je jádro odpovědi na „reprodukovatelný výstup". Jeden report, který by mísil
obojí, by buď lhal o determinismu, nebo by musel zamlčet nálezy.

### 4. Gate `sec:conformance`

V každé šabloně, zapsaný do `MANDATORY_GATES`. Re-odvodí `conformance.json` a porovná
s commitnutou verzí — mechanika `snapshot:diff`, kterou už repo umí a které lidé věří.
Rozdíl = červený gate. Tvrzení o shodě tedy nemůže přežít změnu kódu, která ho poruší.

Regenerace: `pnpm sec:conformance --write` (v `notAGate`, jako `snapshot` a `seed:lock`).

Interakce s waivery je beze změny: `security` je mandatory gate, snížení pod `error` chce
`waivers[]` s důvodem, ADR a expirací, a run se orazítkuje `conformance: "waived"`.

### 5. Kotvy `@asvs`

`// @asvs V1.3.1 - SafeHtml is the only sanitized-HTML sink` — přesně idiom `@adr`. Kotva sama
nic nedokazuje (to je důvod, proč varianta „jen anotace" padla), ale dělá kontrolu dohledatelnou
z kódu a `sec-conformance` ověří, že požadavek v katalogu existuje, že ho váže kontrola platná
pro tuto šablonu a že tatáž kontrola má zelenou sondu. Kotva bez sondy je chyba, ne dokumentace.

### 6. Ledger potlačení, zobecněný

Zobecnění toho, co už je hotové v `desktop-tauri`. Pravidlo: **potlačení je záznam v jednom
zdroji, renderovaný do dialektu každého skeneru, který nad daným ekosystémem běží.** Zdroj nese
důvod a `until:` datum, gate odmítne nedatovaný, neodůvodněný i expirovaný záznam, a rozejití
renderovaného souboru se zdrojem je červený gate.

Dnešní stav a cíl:

| Ekosystém | Zdroj | Dialekty, které musí sedět |
| --- | --- | --- |
| Cargo (desktop-tauri) | `src-tauri/audit.toml` | `osv-scanner.toml` ✅ hotovo (`68b971e`) |
| npm/pnpm | `pnpm-workspace.yaml` overrides | `osv-scanner.toml` |
| Maven/Gradle | `securityPins` / `coordinatePins` v `build.gradle.kts` | `osv-scanner.toml` |
| Kontejner | `.trivyignore` | — (trivy je jediný konzument) |

## Co už laťku splňuje a co chybí

Ověřeno proti vendorovanému `asvs-5.0.0.flat.json`, ne po paměti. **První verze tohoto designu
citovala několik požadavků špatně** — Trusted Types v ASVS 5.0 *nejsou vůbec*, SRI je L3 a ne L2,
cookie atributy jsou v kapitole V3 a ne V7 — a to je samo o sobě argument pro vendorování
standardu a pro `security:catalogue`: číslo požadavku napsané z hlavy je číslo, které nikdo
neověří.

**Už splněno (kontrola existuje, chybí jí jen záznam v katalogu a sonda):**

| ASVS | Požadavek | Co ho plní dnes |
| --- | --- | --- |
| V1.3.1 L1 | untrusted HTML sanitizováno známou knihovnou | `SafeHtml.tsx` (DOMPurify) + `react/no-danger` |
| V3.4.3 L2 | odpovědi nesou `Content-Security-Policy` | vite preview + nginx runtime |
| V3.4.4 L2 | `X-Content-Type-Options: nosniff` | tamtéž |
| V3.4.5 L2 | referrer policy | tamtéž |
| V3.4.6 L2 | `frame-ancestors` pro clickjacking | tamtéž |
| V15.1.2 L2 | inventář závislostí (SBOM) | deterministický CycloneDX z `sec:scan` |

**Chybí — skutečná práce vrstvy:**

| # | Kontrola | Standard | Kde |
| --- | --- | --- | --- |
| C1 | **`Strict-Transport-Security` na runtime** — dnes výslovně delegováno na TLS edge, takže požadavek nikdo neplní uvnitř artefaktu | **V3.4.1 L1** | nginx runtime, backendy |
| C2 | **`Access-Control-Allow-Origin` pevná hodnota** — dnes nesondováno | **V3.4.2 L1** | web, backendy |
| C3 | **Cookie `SameSite` + `HttpOnly`** jako sondovatelný kontrakt | **V3.3.2 / V3.3.4 L2** | backendy `whenFacet authModel != none` |
| C4 | **CSRF postoj pro facet `api`** — origin check, s testem | **V3.5.1 L1** | web + backend |
| C5 | **Gate na citlivá data v browser storage** — dnes jen prózou v SECURITY.md | **V14.3.3 L2** | web, desktop |
| C6 | **Dokumentované remediation lhůty** pro komponenty třetích stran, a žádná komponenta po lhůtě | **V15.1.1 L1 + V15.2.1 L1** | všechny |
| C7 | **Anti-automation** na drahých a autentizačních cestách | **V2.4.1 L2**, V6.1.1/V6.3.1 L1 | backendy |
| C8 | **Prototype-pollution / mass-assignment obrany** sondovatelné | **V15.3.6 / V15.3.3 L2** | web, backendy |
| C9 | **`docs/THREAT-MODEL.md`** odvozený z `flows[]`, pokrytí vynucené | **SSDF PW.1** (ASVS L2 to nežádá) | všechny |
| C10 | **Politika hlášení zranitelností** — kanál a lhůta | **SSDF RV.1** | všechny |
| C11 | **SLSA provenance** — generovaná v CI, ověřovaná před deployem | **SLSA B3** | všechny |

**C6 je zajímavý:** ASVS L1 žádá přesně to, co repo už dělá — datovaná potlačení, která vyprší
(`.trivyignore`, `audit.toml`, `osv-scanner.toml`). Chybí jen *dokumentovaná lhůta* jako
politika, ne jako datum na jednotlivém řádku. E0 tedy nebyla jen úklid; byl to první kus
souladu s V15.1.1.

**Mimo standard, ale doporučeno jako ratchet** (utahování je zdarma, BR-17) — nesmí se ale
vydávat za požadavek ASVS: **Trusted Types** (`require-trusted-types-for 'script'`
+ pojmenovaná DOMPurify policy), **Permissions-Policy**, **COOP/COEP**. Žádné z nich ASVS 5.0
nezmiňuje; jsou to obrany, které React aplikace unese levně. Zapíší se do katalogu se
`requires: []` a `rationale`, aby bylo na první pohled vidět, že jde o vlastní přísnost.

**Ratchet na L3** přidá mimo jiné V3.6.1 (externí assety jen se SRI), V3.4.7 (CSP reporting),
V3.4.8 a V3.5.8 (cross-origin izolace).

## Změny v registru a v SKILL.md

- **§25 Security conformance** — nová sekce: standard set, profily, slovník verdiktů,
  pravidla determinismu, vztah k hard-stop gatům.
- **BR-38** Každá kontrola jmenuje požadavek, sondu a selftest *(katalog ≡ šablony)*
- **BR-39** Tvrzení o shodě je odvozené, ne psané *(regenerace + diff)*
- **BR-40** Potlačení je jeden datovaný záznam, renderovaný do každého dialektu
- **BR-41** Kotva `@asvs` se rozřeší na kontrolu se zelenou sondou
- **NFR-26** Conformance report je byte-reprodukovatelný
- **NFR-27** Sondy jsou offline a bez času *(rozšíření NFR-16)*
- **NFR-28** Profil se dá jen utahovat *(rozšíření BR-17 na `asvsLevel`)*
- **Plugin ADR 013** — volba standard setu a úrovně, s odmítnutými variantami
- **SKILL.md Phase 7** se přepisuje z „aplikuj baseline + spusť skeny" na
  „doplň chybějící kontroly per katalog → vygeneruj conformance → gate"
- **`security:catalogue`** — plugin-level gate: každá položka katalogu má sondu v každé
  šabloně, kterou váže, a každá sonda má položku. Tentýž princip jako `citations`.

## Pořadí implementace

Každá etapa končí zelenou `pnpm verify` na úrovni pluginu.

| E | Obsah | Proč v tomhle pořadí |
| --- | --- | --- |
| **E0** | ✅ **Hotovo** — triáž: seed pin (`960651d`), netty floor (`cc48f12`), ledger do osv dialektu (`68b971e`) | odblokuje verify a osv-scanner; ustaví vzor pro BR-40 a první kus V15.1.1 |
| **E1** | Vendorovaný ASVS 5.0 (sha-pinned) + katalog + `security:catalogue` + ADR 013 + §25 + pravidla | normativní kostra musí stát dřív, než na ni cokoli ukáže |
| **E2** | `sec-conformance.mjs` + `conformance.json` + gate + snapshot digest — **jen `web`**, s katalogem pokrývajícím zatím jen už splněné kontroly | dokázat mechaniku dřív, než se přidá obsah: report, který od začátku svítí zeleně na pravdivém základu |
| **E3** | C1, C2, C4, C5 + ratchet mimo standard (Trusted Types, Permissions-Policy, COOP/COEP) — web, desktop, nginx runtime | levné, okamžité, zvednou reálnou laťku |
| **E4** | Rozšíření na zbylých 9 šablon (symetrie §18 to stejně vynutí) | mechanicky, katalog už existuje |
| **E5** | C3, C7, C8 (backend, facetově podmíněné) | potřebují sondy nad kontraktem a routami |
| **E6** | C6 remediation politika + C9 threat model + C10 disclosure policy | artefakty a politiky, závisí na hotovém katalogu |
| **E7** | SARIF výstup + C11 SLSA provenance + ověření v CD | CI práce, mimo offline verify (NFR-16) |
| **E8** | Profil L3 jako ratchet (`asvsLevel: 3`) + jeho sondy | až L2 stojí a je dokázaná |

## Ověření

- `pnpm verify` (plugin) zelená po každé etapě
- `pnpm verify` v každé šabloně zelená, včetně nového `sec:conformance`
- `gates:selftest` — každá nová sonda má případ selhání *(NFR-25)*
- **Důkaz reprodukce:** dvakrát vygenerovaný `conformance.json` z čistého checkoutu je
  byte-identický; změna kontroly v kódu ho červeně rozejde
- osv-scanner nad repem: 0 nálezů *(stav po E0 — ověřeno)*

## Rozhodnuto v průběhu psaní

- **Kotva `@asvs` je na místo, ne na kontrolu** — jako `@adr`. Jedna kontrola může mít víc
  míst výskytu a nutit je do jedné kotvy by znamenalo vybrat „to hlavní", což je úsudek.
- **Úroveň se do katalogu nepíše** — je vlastností požadavku ve vendorovaném standardu.
- **Vendoruje se `v5.0.0_release`, ne `latest`** — rolling tag by nárok na reprodukci shodil.

## Otevřené otázky

1. **Řezání E4 podle `kind`** — backendové sondy se budou lišit per stack (SpotBugs vs bandit
   vs eslint-security). Katalog to unese přes `appliesTo`, ale sond bude pět variant a §18
   žádá stejné jméno gate ve všech šablonách. Řeší se v E4, ne dřív.
2. **Zda `conformance.json` podepisovat** (varianta D z rozhodování) — odloženo, dá se přidat
   v E7 bez změny tvaru artefaktu.
3. **Co s ASVS požadavky, které jsou aplikovatelné, ale prototyp je nesplní** (např. části V11
   Cryptography, když brief nežádá šifrování dat v klidu). Návrh: `whenFacet` je vyloučí, a když
   nevyloučí, verdikt je poctivě `fail` a řeší ho waiver s ADR — nikdy tichý „N/A".
