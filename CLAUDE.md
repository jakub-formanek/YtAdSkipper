# CLAUDE.md – YT Ad Skipper

Soukromý doplněk pro **Firefox (desktop i Android)**, který přeskakuje reklamy ve videích
na YouTube. Není veřejně v katalogu AMO, podepisuje se jako **unlisted** (vlastní distribuce).
Autor a jediný uživatel: Jakub Formánek. Komunikace i komentáře v kódu jsou česky.

## Struktura projektu

```
src/                    ← samotný doplněk (to, co se balí a podepisuje)
  manifest.json         ← Manifest V2, ID yt-ad-skipper@jakub.formanek.name
  selectors.js          ← VŠECHNY selektory přehrávače (mění se nejčastěji)
  content.js            ← logika přeskakování (selektory si bere ze selectors.js)
  hide.css              ← skrytí reklamních prvků mimo přehrávač
  popup.html / popup.js ← okénko na liště: vypínač, ladicí výpis, počítadlo
  icon.svg
test/content.test.js    ← testy logiky na simulovaném přehrávači (jsdom)
.github/workflows/check.yml ← CI: lint + testy + build při každém pushi
package.json            ← npm skripty (viz níže)
```

## Jak doplněk funguje

**Detekce reklamy.** Přehrávač YouTube (`#movie_player.html5-video-player`) má během reklamy
třídu `ad-showing` (příp. `ad-interrupting`). `content.js` přehrávač kontroluje každých 250 ms
a navíc přes `MutationObserver` při každé změně jeho atributu `class`.

**Během reklamy** (`handleAd`):
1. ztlumí `<video>` (`muted = true`),
2. nastaví `playbackRate = 16`,
3. pokud je `video.duration` ≤ `MAX_SEEK_DURATION` (120 s), přetočí na konec,
4. klikne na první **viditelné** tlačítko odpovídající `SKIP_BUTTON`,
5. když je video pozastavené, zkusí `play()`.

**Po reklamě** (`endAd`) vrátí původní `muted` a `playbackRate`, které si uložil při začátku
reklamy (`startAd`). Uživatelova rychlost (např. 1,5×) se tedy zachová.

**Proč limit na přetáčení:** při vkládání reklam na straně serveru (SSAI) je reklama součástí
streamu celého videa a `video.duration` je délka celého videa. Přetočení na konec by přeskočilo
i obsah. Delší stream se proto jen ztlumí a zrychlí.

**Překryvné reklamy** přes video se zavírají přes `OVERLAY_CLOSE`.
**Reklamní dlaždice a bannery** na stránce skrývá `hide.css` (`display: none !important`).

**Co doplněk záměrně NEDĚLÁ:** neblokuje síťové požadavky a nemění odpovědi serveru
(žádné `webRequest`, žádné úpravy `ytInitialPlayerResponse`). Díky tomu ho YouTube nemá důvod
hlásit jako ad blocker. Oprávnění je jen `storage`. Tuhle vlastnost zachovej, pokud o změnu
výslovně nepožádám.

**Úložiště (`storage.local`):** `enabled` (bool), `debug` (bool), `skipped` (počet reklam).

**Rozsah:** `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `www.youtube-nocookie.com`,
s `all_frames: true` (funguje i ve vložených přehrávačích na jiných webech).

## npm skripty

| příkaz | co dělá |
|---|---|
| `npm test` | testy logiky v jsdom |
| `npm run lint` | `web-ext lint` – kontrola manifestu a kódu podle pravidel AMO |
| `npm run check` | lint + testy |
| `npm run build` | nepodepsaný ZIP do `dist/` |
| `npm start` | spustí Firefox s doplňkem a otevře YouTube |
| `npm run start:android` | dočasně nahraje doplněk do Firefoxu v telefonu přes USB (adb) |
| `npm run sign` | podepíše přes AMO (unlisted) a stáhne `.xpi` do `dist/` |

`npm run sign` potřebuje proměnné prostředí `WEB_EXT_API_KEY` a `WEB_EXT_API_SECRET`
(AMO → Developer Hub → Tools → Manage API Keys). Klíče nikdy necommituj.

## Aktualizace selektorů (když YouTube změní HTML)

### Příznaky
- reklama se ztlumí a zrychlí, ale **tlačítko „Přeskočit“ se nestiskne** → změnil se `SKIP_BUTTON`,
- reklama běží normálně, **nic se neděje** → změnila se třída reklamy (`AD_CLASSES`)
  nebo element přehrávače (`PLAYER`, `VIDEO`),
- **přes video zůstává banner** → `OVERLAY_CLOSE`,
- na stránce jsou **reklamní dlaždice** → `hide.css`.

### 1. Zjistit nový selektor
1. Ve Firefoxu na počítači otevři video s reklamou.
2. V okénku doplňku zapni **Ladicí výpis do konzole**.
3. Otevři webovou konzoli (F12 → Konzole) a během reklamy zavolej:
   ```js
   ytasDiagnose()
   ```
   Vrátí objekt:
   - `playerClasses` – aktuální třídy přehrávače (hledej něco jako `ad-…`),
   - `adShowing` – jestli doplněk reklamu pozná,
   - `matchedSkipSelector` – který známý selektor tlačítka sedí (`null` = žádný),
   - `skipCandidates` – tlačítka v přehrávači, jejichž id/třída/text obsahuje „skip“
     nebo „přeskočit“. Odtud se nejčastěji vezme nový selektor.
4. Případně prvek prozkoumej ručně: pravé tlačítko na „Přeskočit“ → Prozkoumat.
5. Ověř selektor přímo v konzoli, dokud reklama běží:
   ```js
   document.querySelector('NOVÝ_SELEKTOR')?.click()
   ```

Při ladicím výpisu se do konzole vypisují řádky `[YTAS] …` (začátek a konec reklamy, přes jaký
selektor se kliklo).

### 2. Upravit kód
1. V `src/selectors.js` přidej nový selektor **na začátek** příslušného seznamu.
   Staré selektory nemaž hned: YouTube zavádí změny postupně a různým uživatelům ukazuje
   různé verze. Mazat se dají, až se několik měsíců neobjevují.
2. Selektor má mířit přímo na klikací prvek (`<button>`), ne na obalový `div`.
3. V `test/content.test.js` doplň do `selectorFixtures` ukázkové HTML pro nový selektor.
   Test „každý selektor v SKIP_BUTTON má fixture“ jinak selže schválně.
4. Změnu reklamních dlaždic řeš v `src/hide.css`. Nikdy nepřidávej skrývání `.ytp-ad-module`
   ani prvků s tlačítkem „Přeskočit“. Skrytá tlačítka `isVisible()` přeskočí a doplněk
   by na ně neklikl.

### 3. Zvýšit verzi
V `src/manifest.json` zvyš `version` (např. 0.1.2 → 0.1.3) a stejnou hodnotu dej
do `package.json`. AMO nepřijme stejnou verzi dvakrát. **ID doplňku (`gecko.id`) nikdy neměň**,
jinak by šlo o nový doplněk a nainstalovaná verze by se neaktualizovala.

### 4. Ověřit
```
npm run check
npm start          # ruční zkouška na YouTube
```
Po pushi na GitHub totéž spustí CI (`.github/workflows/check.yml`) a k běhu přiloží
nepodepsaný ZIP.

### 5. Podepsat a nainstalovat
- **CLI:** `npm run sign` → podepsaný `.xpi` v `dist/`.
- **Ručně:** AMO → Manage My Submissions → doplněk → **Upload New Version** → nahrát ZIP
  z `npm run build`. Hotový `.xpi` je pak v **Manage Status & Versions** → klik na číslo verze
  → sekce **Files** (ve Firefoxu klik na odkaz rovnou instaluje, pro uložení použij
  „Uložit odkaz jako…“).
- **Desktop:** otevřít `.xpi` ve Firefoxu.
- **Android:** `.xpi` do telefonu → Firefox → Nastavení → O aplikaci Firefox → 5× klepnout
  na logo → v Nastavení se objeví **Install add-on from file** → vybrat soubor.
  Nová verze se nainstaluje přes starou, nastavení i počítadlo zůstanou.

Unlisted doplněk se sám neaktualizuje: každou novou verzi je potřeba nainstalovat ručně.
(Automatické aktualizace by šly přes `update_url` v manifestu a `updates.json` hostovaný
třeba na GitHub Pages. Zatím zavedené nejsou.)

## Další laditelná nastavení (`src/content.js`, začátek souboru)
- `TICK_MS` – interval kontroly (250 ms),
- `AD_RATE` – rychlost během reklamy (16),
- `MAX_SEEK_DURATION` – do jaké délky videa se smí přetáčet na konec (120 s).

## Pravidla pro úpravy (pro Claude)
- Selektory patří jen do `selectors.js`, ne natvrdo do `content.js`.
- Každá změna chování nebo selektorů = nový/upravený test a zvýšená verze.
- Před commitem spusť `npm run check`. Commit jen když projde.
- Neměň `gecko.id`, nepřidávej oprávnění ani síťové blokování bez výslovného zadání.
- Minimální verze: Firefox 140 (desktop), 142 (Android), kvůli klíči
  `data_collection_permissions`, který AMO vyžaduje.
- Doplněk musí fungovat i na m.youtube.com (Firefox pro Android). Při změnách selektorů
  ověř, jestli mobilní verze nepoužívá jiné HTML.
