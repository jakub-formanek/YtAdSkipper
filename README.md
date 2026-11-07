# YT Ad Skipper

Soukromý doplněk pro Firefox (počítač i Android), který na YouTube přeskakuje reklamy ve videích.

Při reklamě:
- ztlumí zvuk a zrychlí přehrávání na 16×,
- krátkou reklamu přetočí na konec,
- klikne na „Přeskočit“,
- zavře překryvné bannery.

Po reklamě vrátí původní hlasitost i rychlost. Na stránce navíc skryje reklamní dlaždice.
Neblokuje síťové požadavky, takže YouTube by ho neměl hlásit jako ad blocker.

## Rychlý start

```
npm install
npm run check      # lint + testy
npm start          # Firefox s doplňkem
npm run build      # nepodepsaný ZIP do dist/
npm run sign       # podepsaný .xpi (potřebuje WEB_EXT_API_KEY a WEB_EXT_API_SECRET)
```

## Instalace

- **Na vyzkoušení (do restartu):** `about:debugging#/runtime/this-firefox` → Načíst dočasný
  doplněk… → `src/manifest.json`.
- **Trvale:** podepsat přes AMO jako unlisted (`npm run sign`), pak otevřít `.xpi` ve Firefoxu.
- **Android:** Nastavení → O aplikaci Firefox → 5× klepnout na logo → Install add-on from file.

## Když přestane fungovat

YouTube čas od času změní HTML přehrávače. Selektory jsou všechny v `src/selectors.js`.
Postup, jak najít nový selektor (funkce `ytasDiagnose()` v konzoli) a vydat novou verzi,
je v [CLAUDE.md](CLAUDE.md#aktualizace-selektorů-když-youtube-změní-html).

## Omezení

Pokud YouTube vloží reklamu přímo do streamu (SSAI), nejde spolehlivě oddělit od obsahu.
Doplněk ji pak jen ztlumí a zrychlí, nepřetáčí ji.
