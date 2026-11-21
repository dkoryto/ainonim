# Spike T2: Pyodide + polanon w dokumencie offscreen

Data: 2026-11-19. Wynik: **działa, wszystkie trzy cele spełnione.**

## Wynik w skrócie

| Miara                                                    | Cel      | Zmierzone                   | Status |
| -------------------------------------------------------- | -------- | --------------------------- | ------ |
| Zimny start (pierwsze żądanie, content script → wynik)   | < 3 s    | mediana **1,45 s** (5 prób) | OK     |
| w tym ładowanie Pyodide + koła + polanon (w offscreen)   | –        | mediana 1,39 s              | –      |
| Ciepłe `analyze`, 2000 znaków, mediana z 20 (w Pythonie) | < 100 ms | **15,1 ms** (maks. 22,4 ms) | OK     |
| to samo, pełna droga content script → SW → offscreen     | –        | mediana 18,8 ms             | –      |
| Rozmiar `.output/chrome-mv3` (suma plików)               | < 15 MB  | **13,66 MB** (13 658 521 B) | OK     |
| Rozmiar zip (`npm run zip`)                              | –        | **6,60 MB** (6 603 953 B)   | –      |
| Wątki / SharedArrayBuffer / COOP+COEP                    | –        | **niepotrzebne**            | –      |

Rozmiar mieści się w celu z zapasem tylko ~1,3 MB; 98% to sam Pyodide (wasm 9,60 MB,
stdlib 2,55 MB, loader 1,27 MB). Zob. „Co dalej”.

## Środowisko i metoda

- Maszyna: Apple M1 Max, 32 GB RAM, macOS 27.0.1.
- Przeglądarka: Chromium (Chrome for Testing) **159.0.8154.6** z Playwright 1.65.1, kanał
  `chromium` (nowy tryb headless, który obsługuje rozszerzenia), czysty profil przy każdym
  uruchomieniu.
- Sieć: Chromium uruchamiany z `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, czyli bez
  DNS poza lokalnym serwerem testowym. Każde odwołanie do CDN skończyłoby się błędem, więc
  przechodzący test potwierdza, że wszystko ładuje się z paczki.
- Wersje: pyodide **314.0.8** (Python 3.14.2, najnowsza stabilna w npm), polanon **0.4.1**
  (koło zbudowane z lokalnego repo, commit `d29b91e`), WXT 0.21.5, Vite 8.3.8.
- Polecenie: `npm run measure` (build + `tests/e2e/measure.spec.ts`, wypisuje JSON z wynikami).
- Zimny start: 5 osobnych uruchomień przeglądarki z czystym profilem. Czas liczony w teście od
  `postMessage` strony do odpowiedzi; obejmuje utworzenie dokumentu offscreen, `loadPyodide`,
  pobranie i rozpakowanie koła, `import polanon` i budowę `Anonymizer`. Osobno dokument offscreen
  raportuje `loadMs` (od startu skryptu do gotowości).
- Ciepłe: 20 kolejnych wywołań na tym samym tekście 2000 znaków (polski akapit z imionami,
  PESEL, NIP, IBAN, telefonem, e-mailem, adresem; > 10 wykrytych encji), po zimnym starcie.
  `analyzeMs` mierzy wywołanie `analyze` w Pythonie razem z `JSON.parse` i walidacją wyniku.
- Rozmiar: suma rozmiarów plików w `.output/chrome-mv3` (`du` podaje ~15,5 MB przez bloki
  systemu plików, to nie jest rozmiar paczki) oraz rozmiar zipa z `wxt zip`.

Pojedyncze próby (ms): zimny start 1432,5 / 1447,8 / 1453,8 / 1425,7 / 1446,2; `loadMs` 1385,0 /
1392,2 / 1393,8 / 1380,4 / 1392,6. Poprzednie uruchomienie dało medianę 1,49 s i 15,2 ms.

## Jak to jest zbudowane

- `wxt.config.ts` kopiuje do paczki z `node_modules/pyodide` tylko `pyodide.mjs`,
  `pyodide.asm.mjs`, `pyodide.asm.wasm`, `python_stdlib.zip`, a `pyodide-lock.json` zapisuje okrojony
  do bloku `info` z pustą listą pakietów (Pyodide sprawdza z nim ABI; 111 B zamiast 116 KB). Bez
  pakietów w lock-file Pyodide nie ma czego pobierać. Dodatkowo `packageBaseUrl` wskazuje na
  paczkę, bo domyślnie Pyodide używa jsDelivr.
- Koło polanon leży w `vendor/` (w repo) i jest kopiowane do `python/`. W offscreen:
  `fetch` → `pyodide.unpackArchive(buffer, 'wheel')` (rozpakowanie do site-packages).
- `python/ainonim_bridge.py` jest wbudowany w skrypt offscreen (`?raw`) i wykonywany przez
  `runPython` we własnej przestrzeni nazw; `analyze(text)` zwraca JSON (`anonymized`, `spans`,
  `mapping`), który JS waliduje (`lib/shared/messages.ts`).
- `loader` Pyodide (`pyodide.mjs`) jest ładowany dynamicznym `import()` z adresu w paczce, a nie
  bundlowany przez Vite, żeby sam znalazł swoje pliki obok.
- CSP stron rozszerzenia: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`. Nie było
  potrzeby `'unsafe-eval'`: w `pyodide.asm.mjs` są wywołania `eval` (Emscripten `EM_ASM`/`EM_JS` dla
  dynamicznie ładowanych bibliotek `.so` i `emscripten_run_script`), ale ścieżka ładowania samego
  interpretera i kodu czysto pythonowego ich nie używa. **Uwaga na przyszłość:** pakiet Pyodide z
  rozszerzeniem C (`.so`) mógłby na tym polec.
- Dokument offscreen tworzony leniwie przy pierwszym żądaniu (`chrome.offscreen.createDocument`,
  powód `WORKERS`), potem wykrywany przez `chrome.runtime.getContexts` i używany ponownie;
  równoległe pierwsze żądania czekają na tę samą obietnicę utworzenia.
- Wiadomości mają typy i `id` żądania (`lib/shared/messages.ts`). Offscreen przyjmuje żądania tylko spoza
  kart (`sender.tab` puste), bo content scripty też dosięgają stron rozszerzenia.

## Wątki

Nic nie wymagało wątków. `anonymize_sync` działa w głównym wątku dokumentu offscreen; polanon
używa `threading.Lock` (w `index.py`), który w Pyodide działa, ale nie tworzy wątków. Nie są
potrzebne `SharedArrayBuffer`, COOP/COEP ani Pyodide w Web Workerze. Asynchroniczne
`Anonymizer.anonymize` (wątek roboczy) nie było używane.

## Ograniczenia i otwarte sprawy

- **Offsety spanów** są indeksami Pythona (punkty kodowe), a JS liczy w jednostkach UTF-16. Dla
  tekstu bez znaków spoza BMP (np. emoji) są równe; pełny bridge (późniejsze zadanie) musi je
  przeliczać.
- **Analiza blokuje wątek offscreen** na ~15 ms / 2000 znaków. Długie teksty (np. 50 000 znaków)
  warto zmierzyć osobno; jeśli będą wolne, można przenieść Pyodide do Workera wewnątrz offscreen.
- Content script w T2 to tylko mostek testowy (`window.postMessage`) na `localhost`/`127.0.0.1`;
  do zastąpienia w zadaniu z obserwacją pól.
- Pomiar w Chromium headless na szybkim M1 Max. Na słabszym laptopie zimny start może być 2–3 razy
  dłuższy; cel 3 s może wtedy być zagrożony. Warto powtórzyć na typowym sprzęcie użytkownika.
- Gałąź Google Chrome (nie Chromium) od wersji 137 ignoruje `--load-extension`, dlatego testy e2e
  używają Chromium z Playwright.

## Co dalej (gdyby trzeba było zejść z rozmiarem lub zimnym startem)

- Rozmiar: przyciąć `python_stdlib.zip` do modułów faktycznie importowanych przez polanon (zip ma
  2,55 MB; samo `json`, `re`, `dataclasses`, `hashlib` itd. to ułamek), usunąć z koła nieużywane
  w przeglądarce części polanon (`gateway`, `integrations`, `judge`). Rdzenia wasm (9,6 MB) nie da
  się zmniejszyć bez własnego buildu Pyodide.
- Zimny start: snapshot pamięci Pyodide (`_makeSnapshot`/`_loadSnapshot`, API wewnętrzne,
  niestabilne) albo wstępne uruchomienie dokumentu offscreen przy starcie przeglądarki
  (`runtime.onStartup`) zamiast przy pierwszym żądaniu.
