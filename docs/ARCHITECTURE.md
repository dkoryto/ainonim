# Architektura kodu

AInonim działa w czterech kontekstach rozszerzenia MV3: content script na stronach, service
worker, dokument offscreen (Pyodide + polanon) i strony rozszerzenia (okienko, ustawienia,
raport). Każdy kontekst to osobny bundle i osobne uprawnienia, więc kod w `lib/` jest podzielony
według tego, gdzie działa. Granice sprawdza ESLint (`npm run lint`).

## Układ katalogów

```
entrypoints/        punkty wejścia WXT: tylko wiązanie modułów z lib/, HTML i CSS
  background.ts     service worker
  content/          content script
  offscreen/        dokument offscreen
  popup/ options/ report/   strony rozszerzenia
  test-bridge.content.ts    mostek testowy, tylko w buildzie --mode e2e
lib/
  shared/           kod wspólny dla wszystkich kontekstów, bez zależności od innych obszarów:
                    wiadomości i ich walidatory (messages.ts), limity czasu, zakresy (spans.ts),
                    nazwy kategorii (labels.ts), znaczniki (tokens.ts), klucze rozmów,
                    własne słowa (custom-words.ts), model wpisu dziennika (log-entries.ts)
  settings/         ustawienia w storage.sync, po jednym module na obszar; index.ts to publiczne
                    API (`~/lib/settings`), storage.ts to pomocnicze funkcje zapisu i nasłuchu
  sites/            adaptery czatów (jeden plik na czat), rejestr (index.ts) i access.ts:
                    efektywny poziom działania na stronie
  log/              zapis i eksport dziennika (store.ts, csv.ts): service worker i strony
  content/          content script: klient wiadomości, maskowanie, fields/ (pola), restore/
                    (przywracanie w odpowiedziach), ui/ (ikona, panel, podświetlenie)
  background/       service worker: obsługa wiadomości (worker.ts), dokument offscreen,
                    reguły wykrywania (refine.ts), mapping/ (mapowania rozmów)
  offscreen/        silnik w dokumencie offscreen (engine.ts) i ścieżki plików Pyodide
  pages/            logika stron rozszerzenia: okienko, options/ (zakładki ustawień), raport
tests/
  unit/             testy jednostkowe; odwzorowują lib/: lib/<obszar>/<moduł>.ts ma test
                    tests/unit/<obszar>/<moduł>.test.ts (entrypoints/ ma tests/unit/entrypoints/)
  e2e/              testy Playwright z prawdziwym rozszerzeniem
  fixtures/         strony czatów i dokumenty testowe
```

## Reguły importów

Obszar może importować tylko z siebie i z obszarów w drugiej kolumnie:

| Obszar           | Może importować z                    |
| ---------------- | ------------------------------------ |
| `lib/shared`     | –                                    |
| `lib/settings`   | `shared`                             |
| `lib/sites`      | `shared`, `settings`                 |
| `lib/log`        | `shared`                             |
| `lib/content`    | `shared`, `settings`, `sites`        |
| `lib/background` | `shared`, `settings`, `sites`, `log` |
| `lib/offscreen`  | `shared`                             |
| `lib/pages`      | `shared`, `settings`, `sites`, `log` |

Ponadto:

- `lib/` nie importuje niczego z `entrypoints/`.
- Kod spoza własnego katalogu importuje się przez alias `~/lib/...`, a z tego samego katalogu przez
  `./`. Import względny `../` jest w `lib/` zabroniony, żeby nie dało się nim obejść reguł.
- Ustawienia importuje się z `~/lib/settings`, nie z pojedynczych modułów `lib/settings/*`.
- Testy (`tests/`) mogą importować wszystko.

Reguły są w `eslint.config.js` (`no-restricted-imports`, tablica `ALLOWED_IMPORTS`).

## Gdzie dodać nowy kod

- Działa tylko w jednym kontekście: do jego obszaru (`content`, `background`, `offscreen`,
  `pages`).
- Potrzebny w kilku kontekstach i bez zależności od API przeglądarki: do `lib/shared/`.
- Nowe ustawienie: nowy moduł w `lib/settings/` (zwykle z `syncedSetting` ze `storage.ts`) i
  `export *` w `lib/settings/index.ts`.
- Nowy czat: plik w `lib/sites/` i wpis w `adapters` w `lib/sites/index.ts`.
- `entrypoints/` tylko łączy moduły z `lib/`; logikę, którą warto testować, przenieś do `lib/`.
