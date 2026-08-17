# proto-forge — design: dokumentace sleduje realitu (ADR → docs, odvozené bloky)

- Status: proposed
- Date: 2026-08-17
- Extends: docs/specs/2026-08-12-production-grade-design.md (BR-19, BR-36)
- Register space: **§26**, rules **BR-42**, **BR-43**, plugin ADR **014**

## Zadání

> „Při aktualizaci ADR rovnou aktualizuj i dokumentaci včetně obrázků atd.
> Dokumentace musí odpovídat vždy tomu, jak teď funguje vytvářená aplikace."

Dvě věty, dvě různá pravidla: **vazba** (změna rozhodnutí strhne dokumentaci) a
**invariant** (dokumentace nikdy netvrdí neplatné).

## Co už platí

Zadání je z velké části splněné a stojí za to to říct dřív, než se začne stavět:

| Dokument | Hlídaná čerstvost | Čím |
| --- | --- | --- |
| `docs/components/**`, `docs/features/**` | ✅ včetně screenshotů | `docs:verify` + `.shot.lock` (hash zdroje, ze kterého byl obrázek pořízen) |
| `docs/STATUS.md` | ✅ re-render z `quality.json` | `status:verify` (BR-36) |
| `docs/DEPLOYMENT.md` — tabulka prostředí | ✅ odvozená z configu | `env:verify` |
| `docs/external/**` | ✅ provenance + vlastníci | `external:verify` (BR-18) |
| `docs/adr/**` | kotvy, stavy, prompt-log | `adr:lint` |
| `docs/ARCHITECTURE.md` | ❌ **nic** | — |
| `docs/SECURITY.md` | ❌ **nic** | — |
| `docs/TROUBLESHOOTING.md` | ❌ **nic** | — |

Chybí tedy: vazba ADR → dokumentace (úplně) a hlídání prózových dokumentů (úplně).

## Past, která určila tvar řešení

První nápad — *„commit, který sahá na ADR, musí sáhnout i na jeho docs stránky"* — je
špatně, a stojí za to vědět proč.

Když se změní **jen text ADR** a zdroják komponenty ne, `docs:shots` vyrobí bajtově
identický obrázek a `.shot.lock` se nehne. **Není co stageovat.** Gate by tedy vynutil
kosmetickou změnu a naučil lidi psát mezeru navíc místo dokumentace — přesně ten druh
gate, který se obchází snáz, než plní.

Řešení je obrátit směr: **ne „commit musí obsahovat", ale „strom nesmí být rozejitý".**
Invariant stromu nejde obejít přerovnáním commitů a platí i pro ADR změněné dodatečně,
ne jen při překlopení do `accepted`.

## Část 1 — ADR se stane součástí zámku dokumentačního subjektu (BR-42)

`.shot.lock` dnes drží hash zdrojů, ze kterých byl obrázek pořízen. Rozšíří se o ADR,
která ten subjekt řídí — **odvozená z `@adr` kotev**, nikdy ručně vypsaná:

```jsonc
{
  "sources": ["src/features/invoices/InvoiceList.tsx", "src/features/invoices/index.ts"],
  "adrs": { "030": "<sha256 těla ADR 030>" },
  "hash": "<sha256 sources>"
}
```

Odvození: ADR `NNN` → soubory nesoucí `// @adr NNN` → subjekt (komponenta nebo featura),
do kterého ty soubory patří → jeho stránka v `docs/`. Mapování soubor→subjekt už existuje
v `docs-lib.mjs` (`features()`, `componentSources()`); nová je jen agregace přes kotvy.

**Hashuje se tělo ADR, ne celý soubor.** Frontmatter se mění při překlopení stavu
(`proposed → accepted`) a při doplnění prompt-log odkazu — to jsou administrativní změny,
které dokumentaci nemění. Hashuje se obsah **od prvního `## ` nadpisu dál**, takže
zámek trhá změna *rozhodnutí*, ne změna jeho evidence.

Chování: změna těla ADR 030 ⇒ zámek každého subjektu, který ho kotví, je zastaralý ⇒
`docs:verify` červená s větou, která jmenuje ADR i stránku. Odemyká to `pnpm docs:shots`,
který zároveň přegeneruje obrázky — takže „včetně obrázků" ze zadání není zvláštní
pravidlo, je to vedlejší efekt jediné cesty, kterou se zámek dá obnovit.

To je přesně sémantika, kterou už znáte: *„obrázek staršího kódu padá"* se rozšiřuje na
*„stránka staršího rozhodnutí padá"*.

### Šablony bez UI

`docs:shots` existuje jen tam, kde je co fotit (`web`, `desktop-*`). U `api-*` je jeho
protějškem `docs:examples` — zachycený příklad požadavku a odpovědi u endpointu (BR-26).
Zámek se jmenuje `.doc.lock`, producent je jiný, mechanika a chybová hláška stejné.
`workspace` a `e2e` nemají dokumentační subjekty vázané na kód; BR-42 je pro ně
prázdná množina, ne výjimka — gate proběhne a nic nenajde.

## Část 2 — prózové dokumenty odvozují ověřitelná tvrzení (BR-43)

Vzor `STATUS.md` / `DEPLOYMENT.md` rozšířený na zbytek: mezi značkami stojí blok, který
gate **re-renderuje ze zdroje a bajtově porovná**. Kolem bloků zůstává volná próza pro to,
co odvodit nejde — mizí jen tvrzení, která stroj umí ověřit a člověk je psal rukou.

| Dokument | Odvozený blok | Zdroj |
| --- | --- | --- |
| `ARCHITECTURE.md` | tabulka rout, entity domény, vrstvení a importní pravidla, index ADR se stavy | `src/app/routes.ts`, `src/domain/*`, eslint boundaries, `docs/adr/` |
| `SECURITY.md` | CSP řetězec a set hlaviček, řetěz gatů, ledger potlačení s daty expirace | `vite.config.ts` / nginx conf, `package.json`, `.trivyignore` + `audit.toml` |
| `TROUBLESHOOTING.md` | registr diagnostik a jejich náprav | `doctor.mjs` / `heal.mjs` |

Backendové protějšky: `ARCHITECTURE.md` bere profil z `architecture.json` a moduly
z derivace (T15–T17), `SECURITY.md` bere hlavičky z `platform/` kernelu.

**Proč bajtový diff a ne „obsahuje":** volnější kontrola („dokument zmiňuje CSP") projde
i nad zastaralou hodnotou. Re-render a porovnání je jediná forma, u které nejde být
částečně pravdivý.

## Kam to sedne

**Rozšíření `docs:verify`, ne nový gate.** Gate `docs` je v `MANDATORY_GATES` a existuje
ve všech deseti šablonách; nové jméno by podle §18 vynutilo enforcer a selftest všude,
včetně šablon, kde nemá co dělat. Producent zámků zůstává `docs:shots` / `docs:examples`.

- **§26 Documentation fidelity** — nová sekce registru
- **BR-42** — Rozhodnutí řídí svou dokumentaci *(zámek subjektu nese ADR, odvozeno z kotev)*
- **BR-43** — Prózový dokument odvozuje, co odvodit lze *(re-render + bajtový diff)*
- **Plugin ADR 014** — s odmítnutou variantou „commit musí obsahovat" a proč
- **SKILL.md** — Phase 4 DoD a Phase 8 dostanou větu o zámku; §9 workflow beze změny

## Pořadí implementace

| E | Obsah | Proč tak |
| --- | --- | --- |
| **E1** | §26 + BR-42/43 + ADR 014 | normativní kostra dřív než enforcement |
| **E2** | BR-42 ve `web`: odvození kotev, `adrs` v `.shot.lock`, `docs:shots` je plní, `docs:verify` je kontroluje, selftest cases | jedna šablona jako důkaz mechaniky |
| **E3** | BR-42 do `desktop-*` (stejný producent) a `api-*` (`docs:examples`, `.doc.lock`) | symetrie §18 |
| **E4** | BR-43 pro `SECURITY.md` — nejužší a nejlépe odvoditelný blok | nejmenší riziko, okamžitá hodnota |
| **E5** | BR-43 pro `ARCHITECTURE.md` | největší blok, závisí na E4 vzoru |
| **E6** | BR-43 pro `TROUBLESHOOTING.md` | nejméně naléhavé |

## Ověření

- `gates:selftest` v každé dotčené šabloně: *ADR změněné po zamčení stránky padá*,
  *překlopení stavu ADR samo o sobě zámek netrhá*, *`docs:shots` zámek obnoví*,
  *ručně upravený odvozený blok padá*, *odvozený blok po změně zdroje padá*
- `pnpm verify` na úrovni pluginu i každé šablony zelená
- `citations` musí projít: BR-42/43 jmenují enforcer i selftest case v každé šabloně,
  kterou jejich `Scope:` váže

## Otevřené otázky

1. **Co s ADR, které nemá kotvu v kódu** (delivery 200–209, security 100–199 popsaná jen
   v `SECURITY.md`). BR-42 je pro ně prázdná; pokrývá je až BR-43 přes odvozený blok.
   Návrh: nechat tak a nezavádět ruční `Docs:` pole — druhý zdroj pravdy se rozejde.
   K přehodnocení, pokud se ukáže, že díra je v praxi velká.
2. **Zda `adrs` v zámku pinovat i pro `superseded` ADR** — návrh: ne, supersede řeší
   nové ADR se svou vlastní kotvou.
