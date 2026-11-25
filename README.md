# AInonim

Rozszerzenie Chrome (Manifest V3), które wykrywa polskie dane osobowe w polach tekstowych i
zamienia je na znaczniki, zanim trafią do czatu AI albo formularza. W czatach AI pokazuje potem
oryginały z powrotem w odpowiedziach, tylko na ekranie użytkownika.

Wykrywaniem zajmuje się biblioteka [polanon](https://github.com/dkoryto/polanon) uruchomiona w
przeglądarce przez [Pyodide](https://pyodide.org). Wszystko działa lokalnie: Pyodide i polanon są
w paczce rozszerzenia, wtyczka niczego nie pobiera i nie wysyła.

Wersja: 0.4.4 (zob. [CHANGELOG.md](CHANGELOG.md)). Przetestowana automatycznie na stronach
testowych; adaptery czatów sprawdzone na żywo tylko częściowo (zob. [Ograniczenia](#ograniczenia)).
Rozszerzenie nie jest jeszcze opublikowane w Chrome Web Store.

## Spis treści

- [Funkcje](#funkcje)
- [Instalacja](#instalacja)
- [Ustawienia](#ustawienia)
- [Prywatność](#prywatność)
- [Jak to działa](#jak-to-działa)
- [Rozwój](#rozwój)
- [Ograniczenia](#ograniczenia)
- [Dokumentacja](#dokumentacja)
- [Licencje](#licencje)

## Funkcje

- **Wykrywanie polskich danych** w każdym polu tekstowym na każdej stronie: imiona i nazwiska
  (także w odmianie), PESEL, NIP, REGON, KRS, dowód osobisty, paszport, IBAN, karty płatnicze,
  adresy, kody pocztowe, telefony, e-maile, daty urodzenia, tablice rejestracyjne, VIN, adresy IP
  i inne. Pola haseł, kart płatniczych i kodów jednorazowych są pomijane.
- **Ikona w rogu pola** pokazuje stan analizy: pulsuje w trakcie, czerwona liczba to znalezione
  dane, zielony znaczek oznacza brak danych, szary „!” błąd. Znalezione fragmenty są podkreślone.
- **Panel** (kliknięcie ikony): lista wartości z polem wyboru i przełącznikiem
  „znacznik | ogólnie” przy każdej. „Zamaskuj zaznaczone” wpisuje wynik w pole, „Cofnij”
  przywraca tekst sprzed maskowania.
  - znacznik: `Jan Kowalski` → `<OSOBA_1>`,
  - ogólnie: data → rok, adres → miasto, PESEL → `[PESEL]` (tego nie da się przywrócić).
- **Trzy tryby maskowania**:
  - _Ręcznie_ (domyślnie) – tylko z panelu,
  - _Przy wysyłce_ – w czatach AI Enter albo przycisk wysyłania najpierw maskuje, potem wysyła,
  - _Przy pisaniu_ – pole maskuje się samo po ok. 1,5 s przerwy, na każdej stronie.
- **Czaty AI**: ChatGPT, Claude.ai, Gemini, Grok, Perplexity, Kimi, DeepSeek, Mistral Le Chat,
  Microsoft Copilot i Qwen. Znaczniki są wspólne w obrębie rozmowy, a w odpowiedziach modelu i we
  własnych wysłanych wiadomościach AInonim pokazuje oryginały, także w odmianie
  (`<OSOBA_1:wołacz>` → „Janie Kowalski”). Przywrócone wartości są podświetlone na turkusowo; po
  najechaniu widać, jaki znacznik dostał model. Można też zostawić na ekranie znaczniki i
  podglądać oryginały tylko po najechaniu.
- **Kategorie**: każdy rodzaj danych można wyłączyć albo ustawić mu domyślną zamianę
  („znacznik” lub „ogólnie”).
- **Własne słowa**: słowa, frazy i wyrażenia regularne do maskowania jako `<SLOWO_1>`,
  `<SLOWO_2>`…, z eksportem i importem listy (JSON).
- **Strony**: AInonim działa wszędzie, tylko w czatach AI albo tylko na stronach z listy; każdą
  stronę można wyłączyć.
- **Zapamiętane dane**: okienko wtyczki pokazuje pary znacznik → oryginał dla każdej rozmowy i
  pozwala je usunąć.
- **Dziennik maskowania**: kiedy, na jakiej stronie i ile danych jakiego rodzaju zamaskowano, bez
  samych danych; eksport CSV i raport do zapisania jako PDF. Można go wyłączyć.

## Instalacja

Dopóki AInonim nie jest w Chrome Web Store, instaluje się go jako rozszerzenie rozpakowane:

1. Zbuduj paczkę: `npm ci && npm run build` (wynik w `.output/chrome-mv3`).
2. Otwórz `chrome://extensions`, włącz „Tryb dewelopera”.
3. „Załaduj rozpakowane” → wskaż folder `.output/chrome-mv3`.
4. Odśwież otwarte karty.

Rozszerzenie rozpakowane nie aktualizuje się samo. Po każdej nowej wersji kliknij „Załaduj
ponownie” na karcie AInonim i odśwież karty z czatami; inaczej Chrome może dalej uruchamiać stary
kod w tle.

## Ustawienia

Okienko wtyczki (ikona na pasku) ma: działanie na bieżącej stronie (Ostrzegaj / Wyłączone),
tryb maskowania, sposób pokazywania odpowiedzi (Oryginały / Znaczniki), zapamiętane dane i link
„Ustawienia”. Strona ustawień ma zakładki:

| Zakładka     | Co ustawia                                                                  |
| ------------ | --------------------------------------------------------------------------- |
| Ogólne       | tryb maskowania, wygląd odpowiedzi w czacie, zapisywanie dziennika          |
| Strony       | gdzie działa AInonim (wszędzie / czaty AI / lista), lista wyłączonych stron |
| Kategorie    | które rodzaje danych wykrywać i czym je domyślnie zastępować                |
| Własne słowa | lista słów i wzorców do maskowania, eksport i import                        |
| Dziennik     | podsumowanie i ostatnie maskowania, eksport CSV, raport PDF, czyszczenie    |
| O autorze    | autor, wersja, ocena i polecenie wtyczki                                    |

Ustawienia są w `storage.sync`, więc przy włączonej synchronizacji Chrome przenoszą się na inne
urządzenia tego samego konta.

## Prywatność

- Tekst pól jest analizowany wyłącznie w przeglądarce. Rozszerzenie nie ma serwera, statystyk ani
  telemetrii.
- Pary znacznik → oryginał są tylko w pamięci sesji (`storage.session`, najwyżej 50 rozmów) i
  znikają po zamknięciu przeglądarki. Strona czatu dostaje mapowanie wyłącznie swojej witryny.
- Własne słowa są w `storage.sync` i mogą zawierać dane osobowe; przy włączonej synchronizacji
  Chrome trafiają na konto Google użytkownika.
- Dziennik (`storage.local`, najwyżej 1000 wpisów) zapisuje czas, nazwę hosta i liczby, nigdy
  wartości ani znaczniki. Skrypt na stronie może wpis dodać, ale nie może dziennika odczytać.

Pełna polityka: [docs/privacy-policy.md](docs/privacy-policy.md). Analiza zagrożeń:
[docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Jak to działa

```
content script ──runtime.sendMessage──▶ service worker ──runtime.sendMessage──▶ dokument offscreen
 (pola, panel,                          (ustawienia wykrywania,                 (Pyodide + polanon,
  przywracanie)                          mapowania, dziennik)                    python/ainonim_bridge.py)
```

Pyodide działa w dokumencie offscreen, bo service worker MV3 jest usypiany po ok. 30 s
bezczynności i interpreter trzeba by ładować od nowa.

Kod w `lib/` jest podzielony według kontekstu, w którym działa; podział i reguły importów opisuje
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Content script** (`entrypoints/content/`, `lib/content/`) działa na każdej stronie, we wszystkich
ramkach:

- `lib/sites/access.ts` decyduje, czy ma działać na stronie (`siteScope`, `allowedSites`,
  `siteLevels`), i reaguje na każdą zmianę; po wyłączeniu usuwa wszystko, co dodał.
- `lib/content/fields/` obserwuje pola (także edytory contenteditable: ProseMirror, Lexical,
  Quill), czyta ich tekst i wpisuje wynik maskowania.
- `lib/content/masking.ts` analizuje tekst po przerwie w pisaniu, prowadzi panel i „Cofnij”;
  `auto-mask.ts` przechwytuje wysyłanie w czatach (faza capture, przed stroną); `typing-mask.ts`
  maskuje po przerwie w pisaniu; `generalise.ts` tworzy wartości „ogólnie”.
- `lib/sites/` zawiera adaptery czatów (jeden plik na czat): pole wiadomości, odpowiedzi, wysłane
  wiadomości, przycisk wysyłania i identyfikator rozmowy z adresu.
- `lib/content/restore/` zamienia znaczniki na oryginały w odpowiedziach i wysłanych
  wiadomościach, zmieniając tylko `data` istniejących węzłów tekstu, i podświetla je przez CSS
  Custom Highlight API. Pola wpisywania wiadomości nigdy nie zmienia.
- `lib/content/ui/` rysuje ikonę i panel w zamkniętym shadow root.

**Service worker** (`entrypoints/background.ts`, `lib/background/`) tworzy dokument offscreen
przy pierwszym żądaniu, stosuje wyłączone kategorie i własne słowa (`lib/background/refine.ts`),
trzyma mapowania rozmów (`lib/background/mapping/`) i dopisuje wpisy dziennika (`lib/log/`).

**Dokument offscreen** (`entrypoints/offscreen/`, `lib/offscreen/`) ładuje Pyodide i polanon.

**Strony rozszerzenia**: okienko (`entrypoints/popup/`), ustawienia (`entrypoints/options/`,
zakładki w `lib/pages/options/`) i raport do druku (`entrypoints/report/`); ich logika jest w
`lib/pages/`. Ustawienia (`storage.sync`) są w `lib/settings/`, po jednym module na obszar.

### Komunikacja

- Content scripty wołają funkcje z `lib/content/client.ts` (`analyzeText`, `analyzeInConversation`,
  `restoreText`, `getConversationMapping`, `renameConversation`). Żadna nie rzuca wyjątku:
  zwracają `{ ok: true, … }` albo `{ ok: false, code, error }`, gdzie `code` to
  `invalid-request`, `too-long`, `timeout`, `engine`, `forbidden` lub `conflict`. Opis błędu
  podaje etap, na którym wystąpił (np. `worker:create-offscreen: Error: …`).
- Żądania z kluczem rozmowy service worker przyjmuje tylko wtedy, gdy witryna klucza (`chatgpt:`)
  zgadza się z adresem ramki nadawcy (`lib/background/mapping/access.ts`); inaczej odpowiada
  `forbidden`.
  Listę i usuwanie zapamiętanych danych obsługują tylko strony rozszerzenia.
- Każda wiadomość ma `id` żądania i jest sprawdzana strażnikami typów (`lib/shared/messages.ts`).
- Limit tekstu: 50 000 znaków, sprawdzany w kliencie, w service workerze i w offscreen.
- Czas: do 20 s na gotowość silnika (utworzenie offscreen i ładowanie Pyodide), potem 5 s na samo
  `analyze`/`restore`. Po przekroczeniu czasu service worker zamyka dokument offscreen, bo Pythona
  nie da się przerwać; następne żądanie tworzy go od nowa.

## Rozwój

Wymagania: Node.js 22.12+ (CI: 24); do testów e2e `npx playwright install chromium`; do
przebudowania koła polanon Python 3.11+ i lokalne repozytorium polanon.

| Polecenie               | Co robi                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `npm run dev`           | WXT w trybie deweloperskim                                                  |
| `npm run build`         | buduje `.output/chrome-mv3` i sprawdza, że nie ma w nim kodu testów ani CDN |
| `npm run zip`           | buduje paczkę `.output/ainonim-<wersja>-chrome.zip` do sklepu               |
| `npm test`              | testy jednostkowe (Vitest)                                                  |
| `npm run test:coverage` | testy jednostkowe z pokryciem                                               |
| `npm run test:e2e`      | build `--mode e2e` (z mostkiem testowym) i testy e2e (Playwright)           |
| `npm run screenshots`   | zrzuty ekranu do sklepu w `assets/store/`                                   |
| `npm run measure`       | pomiary czasu zimnego startu i opóźnienia                                   |
| `npm run lint`          | ESLint i Prettier                                                           |
| `npm run typecheck`     | `tsc --noEmit`                                                              |

Mostek testowy (`entrypoints/test-bridge.content.ts`) jest tylko w buildzie `--mode e2e`;
`npm run build` sprawdza, że nie trafił do paczki produkcyjnej.

Testy jednostkowe w `tests/unit/` odwzorowują `lib/`: test modułu `lib/<obszar>/<moduł>.ts` jest w
`tests/unit/<obszar>/<moduł>.test.ts`. Testy e2e są w `tests/e2e/`. `npm run lint` sprawdza też
granice między obszarami `lib/` ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

### polanon

Koło `vendor/polanon-0.4.4-py3-none-any.whl` jest w repozytorium, żeby build nie zależał od sieci
ani od lokalnego repo polanon. Przebudowanie z lokalnej kopii:

```
./scripts/build-polanon-wheel.sh ../polanon
```

### Wydanie

Lista kontrolna: [docs/release.md](docs/release.md). Każda zmiana widoczna dla użytkownika trafia
do [CHANGELOG.md](CHANGELOG.md) i podbija wersję w `package.json`.

Paczkę do Chrome Web Store buduje GitHub Actions: tag `v<x.y.z>` uruchamia workflow
`.github/workflows/release.yml`. Najpierw przechodzi całe CI (lint, typecheck, testy jednostkowe
z pokryciem, e2e z testem prywatności, pomiary), potem `npm run zip`, kontrola zawartości zipa
i test „smoke” rozpakowanego zipa w Chromium. Dopiero wtedy powstaje wydanie GitHub z zipem i sumą
SHA-256 do pobrania. „Run workflow” buduje paczkę z dowolnej gałęzi jako artefakt, bez wydania.

## Ograniczenia

- To pseudonimizacja, nie anonimizacja w rozumieniu RODO.
- Wykrywanie działa na regułach, bez NER: samo nazwisko, nazwa miejscowości czy firma bez formy
  prawnej często umykają. Tekst trzeba przeczytać przed wysłaniem.
- W trybie ręcznym tekst wysłany bez kliknięcia „Zamaskuj zaznaczone” idzie z danymi. Tryb „Przy
  wysyłce” działa tylko w obsługiwanych czatach i tylko dla Entera i przycisku wysyłania; strona,
  która wysyła inaczej (np. własnym skrótem), nie zostanie zatrzymana. W trybie „Przy pisaniu”
  poza czatami tekst wysłany przed upływem 1,5 s przerwy nie zostanie zamaskowany.
- Strona widzi treść pola, zanim zostanie zamaskowana.
- Przywrócone oryginały są w DOM-ie strony czatu (tekst, atrybuty `title`, legenda przy bloku
  edytora ChatGPT), więc skrypty strony mogą je odczytać. AInonim chroni prompt, nie to, co
  strona wyświetla.
- Pliki i obrazy dołączane do czatu, pola w zamkniętych shadow root, edytory na `canvas` i
  `iframe` z innej domeny nie są obsługiwane.
- Przycisk kopiowania bloku w ChatGPT kopiuje znaczniki, nie oryginały.
- Adaptery czatów zależą od selektorów, które strony często zmieniają. Stan sprawdzenia na żywo:
  - ChatGPT i Claude.ai – pole wiadomości i odpowiedzi (19–20.11.2026); wysłane wiadomości w
    Claude.ai jeszcze nie,
  - Gemini – pole, wysłana wiadomość i odpowiedź (21.11.2026),
  - Grok – pole i wysłana wiadomość (odpowiedzi wymagają konta),
  - Kimi, Qwen, Mistral Le Chat – tylko pole wiadomości,
  - Perplexity, DeepSeek, Microsoft Copilot – wyłącznie według znanej budowy stron.
- W DeepSeek tryb „Przy wysyłce” wysyła wiadomość ponownie Enterem, bo przycisk wysyłania nie ma
  pewnego selektora.

## Dokumentacja

- [CHANGELOG.md](CHANGELOG.md) – historia wersji
- [docs/privacy-policy.md](docs/privacy-policy.md) – polityka prywatności (PL i EN)
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) – model zagrożeń
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – struktura kodu i granice między modułami
- [docs/store-listing.md](docs/store-listing.md) – opis i formularze Chrome Web Store
- [docs/release.md](docs/release.md) – lista kontrolna wydania
- [docs/decisions/](docs/decisions/) – decyzje projektowe
- [docs/spikes/T2-pyodide.md](docs/spikes/T2-pyodide.md) – pomiary Pyodide
- [SECURITY.md](SECURITY.md) – zgłaszanie podatności

## Licencje

Kod AInonim: licencja MIT ([LICENSE](LICENSE)). Licencje dołączonych bibliotek (Pyodide, polanon
i inne): [NOTICE](NOTICE), w paczce jako `NOTICE.txt`.
