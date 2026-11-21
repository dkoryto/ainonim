# AInonim

Rozszerzenie Chrome (Manifest V3), które wykrywa polskie dane osobowe w polach tekstowych, zanim
trafią do czatu AI albo formularza. Wykrywaniem zajmuje się biblioteka
[polanon](https://github.com/boromat/polanon) uruchomiona w przeglądarce przez
[Pyodide](https://pyodide.org). Wszystko działa lokalnie: Pyodide i polanon są w paczce
rozszerzenia, nic nie jest pobierane z sieci.

Stan: MVP zintegrowane (wykrywanie i maskowanie w polach na każdej stronie, przywracanie odpowiedzi
w ChatGPT i Claude.ai), przetestowane na stronach testowych; przed wydaniem test na żywych czatach.
Pomiary: [docs/spikes/T2-pyodide.md](docs/spikes/T2-pyodide.md).

## Jak to działa

```
content script ──runtime.sendMessage──▶ service worker ──runtime.sendMessage──▶ dokument offscreen
                                         (tworzy offscreen                      (Pyodide + polanon,
                                          przy pierwszym żądaniu)                python/ainonim_bridge.py)
```

Pyodide działa w dokumencie offscreen, bo service worker MV3 jest usypiany po ok. 30 s
bezczynności i interpreter trzeba by ładować od nowa.

Content script (`entrypoints/content/`) działa na każdej stronie, we wszystkich ramkach:

- Czyta poziom strony z popupu (`lib/settings.ts`); przy `off` nic nie robi i usuwa wszystko,
  co dodał.
- Po przerwie w pisaniu (`lib/fields/watch.ts`) wysyła tekst pola do analizy. W prawym dolnym
  rogu pola, w którym coś wpisano, pokazuje ikonę AInonim ze stanem analizy (pulsuje w trakcie,
  czerwona liczba znalezionych danych albo zielony znaczek, gdy nic nie znalazła), a w edytorach
  contenteditable podświetla znalezione fragmenty (`lib/ui/`). Kliknięcie ikony (albo Enter na
  niej) otwiera panel z listą wartości: każdą można odznaczyć i zamienić na zastępnik
  („znacznik”, `<OSOBA_1>`) albo na tekst ogólny („ogólnie”: rok zamiast daty, miasto zamiast
  adresu, `[osoba]`; `lib/content/generalise.ts`, bez zapisu w mapowaniu). „Zamaskuj
  zaznaczone” wpisuje wynik w pole, „Cofnij” przywraca tekst sprzed ostatniego maskowania, dopóki
  pole go nie zmieniło. Esc albo „×” zamyka panel.
- Na ChatGPT i Claude.ai (`lib/sites/`) tokeny w jednej rozmowie są wspólne: mapowanie
  „zastępnik → oryginał” trzyma service worker w `storage.session` (tylko w pamięci), a strona
  dostaje je tylko dla własnej witryny. Nowa rozmowa ma klucz tymczasowy, który po nadaniu
  identyfikatora w adresie przechodzi na właściwy. W odpowiedziach modelu i we własnych
  wysłanych wiadomościach zastępniki są zamieniane na oryginały tylko na ekranie
  (`lib/restore/`), także w odmianie (`<OSOBA_1:wołacz>` → „Janie Kowalski”). Przywrócona
  wartość ma delikatne podświetlenie, a po najechaniu pokazuje, jaki zastępnik widział czat
  („Jan Kowalski – wysłano jako <OSOBA_1>”). Pole wpisywania wiadomości nigdy nie jest zmieniane.
  W okienku wtyczki przełącznik „W odpowiedziach czatu pokazuj: Oryginały | Znaczniki” (`chatDisplay`
  w `storage.sync`) pozwala zostawić na ekranie zastępniki: są wtedy podświetlone, a oryginał widać
  tylko po najechaniu („<OSOBA_1> = Jan Kowalski”).
- Na innych stronach każda analiza jest niezależna i nic nie jest zapisywane.

### Komunikacja

- Content scripty wołają `analyzeText(text, mapping?)`, `analyzeInConversation(text, key,
persist)`, `restoreText(text, mapping)`, `getConversationMapping(key)` i
  `renameConversation(from, to)` z `lib/client.ts`. Żądania z kluczem rozmowy service worker
  przyjmuje tylko wtedy, gdy witryna klucza (`chatgpt:`) zgadza się z adresem ramki, która je
  wysłała (`lib/mapping/access.ts`); inaczej odpowiada `forbidden`. Żadna z tych funkcji nie rzuca wyjątku: zwracają
  `{ ok: true, … }` albo `{ ok: false, code, error }`, gdzie `code` to `invalid-request`,
  `too-long`, `timeout`, `engine`, `forbidden` lub `conflict` (zastępnik w tej rozmowie oznacza
  już inną wartość).
- Każda wiadomość ma `id` żądania i jest sprawdzana strażnikami typów (`lib/messages.ts`) po każdej
  stronie. Service worker przyjmuje żądania tylko z kart, dokument offscreen tylko spoza kart.
- Limit tekstu: 50 000 znaków (`string.length`), sprawdzany w kliencie, w service workerze i w
  offscreen, zanim tekst trafi do Pythona.
- Czas: najpierw service worker czeka na gotowość silnika (utworzenie offscreen + ładowanie
  Pyodide, do 20 s), dopiero potem liczy 5 s na samo `analyze`/`restore`. Po przekroczeniu
  czasu zamyka dokument offscreen, bo Pythona nie da się przerwać; następne żądanie tworzy go od
  nowa.

## Wymagania

- Node.js 22.12+ (CI: 24)
- do testów e2e: `npx playwright install chromium`
- do przebudowania koła polanon: Python 3.11+ i lokalne repozytorium polanon

## Polecenia

| Polecenie           | Co robi                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `npm run dev`       | WXT w trybie deweloperskim                                          |
| `npm run build`     | buduje `.output/chrome-mv3` i sprawdza, że nie ma w nim kodu testów |
| `npm run zip`       | buduje paczkę `.output/ainonim-<wersja>-chrome.zip`                 |
| `npm test`          | testy jednostkowe (Vitest)                                          |
| `npm run test:e2e`  | build `--mode e2e` (z mostkiem testowym) + testy e2e (Playwright)   |
| `npm run measure`   | build + pomiary spike'u T2 (czas zimnego startu, opóźnienie)        |
| `npm run lint`      | ESLint + Prettier                                                   |
| `npm run typecheck` | `tsc --noEmit`                                                      |

Ręczne załadowanie: `chrome://extensions` → tryb dewelopera → „Załaduj rozpakowane” →
`.output/chrome-mv3`.

## polanon

Koło `vendor/polanon-0.4.1-py3-none-any.whl` jest w repozytorium, żeby build nie zależał od sieci
ani od lokalnego repo polanon. Przebudowanie z lokalnej kopii polanon:

```
./scripts/build-polanon-wheel.sh ../polanon
```

## Ograniczenia

Pełny opis: [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

- To pseudonimizacja, nie anonimizacja w rozumieniu RODO.
- Wykrywanie działa na regułach, bez NER: samo nazwisko, nazwa miejscowości czy firma bez formy
  prawnej często umykają. Tekst trzeba przeczytać przed wysłaniem.
- Nic nie jest maskowane automatycznie: w trybie „ostrzegaj” tekst wysłany bez kliknięcia
  „Zamaskuj” idzie z danymi.
- Przywrócone oryginały są w DOM-ie strony czatu (tekst odpowiedzi i wysłanych wiadomości,
  atrybuty `title`, legenda przy bloku edytora ChatGPT w otwartym shadow root), więc skrypty strony mogą je odczytać. AInonim chroni prompt,
  nie to, co strona wyświetla.
- Strona widzi treść pola, zanim zostanie zamaskowana.
- Pliki i obrazy dołączane do czatu, pola w zamkniętych shadow root, edytory na `canvas` i
  `iframe` z innej domeny nie są obsługiwane.
- Przycisk kopiowania bloku w ChatGPT kopiuje znaczniki, nie oryginały.
- Adaptery ChatGPT i Claude.ai zależą od selektorów, które strony zmieniają.

## Licencje

Zob. [NOTICE](NOTICE) (dołączany do paczki jako `NOTICE.txt`).
