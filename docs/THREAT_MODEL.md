# Model zagrożeń AInonim

Przed czym AInonim chroni, a przed czym nie. To dokumentacja techniczna, nie porada prawna.
Ograniczenia samej biblioteki wykrywającej opisuje
[model zagrożeń polanon](https://github.com/boromat/polanon/blob/main/docs/THREAT_MODEL.md); tu
jest to, co dokłada rozszerzenie i przeglądarka.

Stan (20.11.2026): opisany projekt jest zaimplementowany i pokryty testami e2e na stronach
testowych; nie był jeszcze sprawdzony na żywych ChatGPT i Claude.ai.

## Do czego służy rozszerzenie

Użytkownik pisze w polu tekstowym (czat AI, formularz). AInonim wykrywa w tekście polskie dane
osobowe i po kliknięciu „Zamaskuj” zastępuje je znacznikami, np. `<OSOBA_1>`. Do operatora strony
trafia wtedy tekst ze znacznikami. W ChatGPT i Claude.ai znaczniki w odpowiedzi modelu są
podmieniane z powrotem na oryginały, tylko w widoku strony.

## Zasoby

| Zasób                               | Gdzie jest                                                                                | Wrażliwość                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Tekst edytowanego pola              | DOM strony; kopia w content scripcie, service workerze i offscreen                        | jak dane, które wpisał użytkownik               |
| Mapowanie znacznik → oryginał       | `storage.session` (pamięć), dostęp przez service worker; kopia robocza w content scripcie | jak oryginalne dane: odwraca maskowanie         |
| Przywrócone oryginały               | DOM strony czatu (tekst odpowiedzi, atrybuty `title`, legenda)                            | jak oryginalne dane                             |
| Ustawienia stron                    | `storage.sync`: nazwa hosta → tryb (`warn` / `off`)                                       | niska: lista hostów, bez treści pól             |
| Kod rozszerzenia (Pyodide, polanon) | paczka rozszerzenia                                                                       | integralność: decyduje o tym, co jest wykrywane |

## Granice zaufania

| Strefa                                 | Co widzi                                                              | Zaufana?                                                              |
| -------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Skrypty strony (np. chatgpt.com)       | cały DOM strony, w tym pole przed maskowaniem i przywrócone oryginały | **nie**; to ta sama strona, która wysyła prompt do dostawcy AI        |
| Content script (izolowany świat)       | tekst pola, wynik analizy, mapowanie bieżącej rozmowy                 | tak, ale działa w karcie razem z niezaufaną stroną i dzieli z nią DOM |
| Service worker                         | żądania z kart, mapowania wszystkich rozmów                           | tak                                                                   |
| Dokument offscreen (Pyodide + polanon) | tekst do analizy i mapowanie, które dostaje od service workera        | tak; przyjmuje żądania tylko spoza kart (`sender.tab` puste)          |
| Dostawca AI / operator formularza      | to, co strona wyśle: tekst po maskowaniu albo bez niego               | **nie**; to granica, dla której rozszerzenie istnieje                 |

Skrypty strony nie mają dostępu do pamięci izolowanego świata ani do API rozszerzenia. Mają za to
pełny dostęp do DOM-u, który content script czyta i zmienia.

## Przed czym chroni

- **Dane osobowe w wysyłanym tekście, które użytkownik zamaskował.** Po kliknięciu „Zamaskuj”
  pole zawiera znaczniki; jeśli strona wysyła treść pola, do dostawcy trafiają znaczniki zamiast
  wykrytych wartości.
- **Wysyłanie danych przez samo rozszerzenie.** Rozszerzenie nie ma kodu sieciowego do serwerów
  zewnętrznych, telemetrii ani kont. Pyodide i polanon są w paczce; lock-file Pyodide ma pustą
  listę pakietów, więc interpreter nie ma czego pobierać z CDN.
- **Pola z sekretami.** Pola `type="password"`, pola z `autocomplete` `current-password`,
  `new-password`, `one-time-code` i `cc-*` oraz pola ukryte, wyłączone i tylko do odczytu nie są
  czytane (`lib/fields/editable.ts`).
- **Mapowanie poza zasięgiem strony.** Mapowania są w `storage.session` z domyślnym poziomem
  dostępu `TRUSTED_CONTEXTS`, więc content scripty nie czytają ich bezpośrednio, a skrypty strony
  w ogóle. Service worker oddaje mapowanie tylko dla rozmowy, której klucz zaczyna się od
  identyfikatora strony nadawcy (np. `chatgpt:` dla karty chatgpt.com) (`lib/mapping/access.ts`). Content script z chatgpt.com nie dostanie mapowania rozmowy z Claude.ai.

## Czego nie chroni

### Przywrócone oryginały są w DOM-ie strony

Po przywróceniu oryginały stoją w DOM-ie strony czatu jako zwykły tekst. Skrypty tej strony mogą
je odczytać tak samo, jak każdy inny tekst na ekranie, i np. wysłać do swojego serwera albo
zapisać w historii. Dotyczy to:

- tekstu odpowiedzi (podmienione `data` węzłów tekstowych),
- atrybutu `title` elementu z przywróconym tekstem; dziś zawiera tylko znaczniki
  (`AInonim: <OSOBA_1>`), ale każda zmiana na „znacznik → oryginał” też trafi do DOM-u,
- legendy „znacznik → oryginał” przy edytowalnym bloku ChatGPT („writing block”). Legenda jest w
  **otwartym** shadow root (`attachShadow({ mode: 'open' })` w `lib/restore/observer.ts`), więc
  skrypt strony dosięga jej przez `element.shadowRoot`.

AInonim chroni przed wysłaniem danych **w prompcie**, nie przed odczytaniem przez stronę tego,
co wyświetla w swoim własnym DOM-ie. Przywracanie jest wygodą dla użytkownika, nie mechanizmem
ochrony. Kto nie chce, żeby oryginały pojawiły się na stronie, nie powinien polegać na
przywracaniu.

Możliwe zmiany na przyszłość (niezaplanowane w MVP): legenda w zamkniętym shadow root (utrudnia,
ale nie uniemożliwia odczytu, bo tekst nadal jest renderowany w stronie), pokazywanie oryginałów
w panelu bocznym rozszerzenia (`side_panel`), poza DOM-em strony, zamiast podmiany w odpowiedzi.

Ikona przy polu i panel z listą znalezionych wartości są w zamkniętych shadow root
(`lib/ui/badge.ts`, `lib/ui/icon.ts`); skrypty strony nie sięgają do ich treści (a wartości i tak
widzą w polu, z którego pochodzą).

### Pole przed maskowaniem

To, co użytkownik wpisuje, strona widzi od razu: skrypty strony mogą czytać pole przy każdym
naciśnięciu klawisza, zapisywać szkice albo wysyłać tekst do autouzupełniania, zanim AInonim
cokolwiek pokaże. Maskowanie działa na treść pola w chwili kliknięcia, nie cofa tego, co strona
już odczytała. Zalecenie: wklejać dane, maskować i dopiero potem pisać dalej, a w razie wątpliwości
przygotować tekst poza stroną.

### Pisanie bez maskowania

W trybie `warn` (domyślnym) nic nie jest maskowane automatycznie: odznaka tylko pokazuje, co
znalazła. Tekst wysłany bez kliknięcia „Zamaskuj” idzie w całości, z danymi. W trybie `off`
rozszerzenie na danej stronie nie działa wcale. Tryb automatyczny nie istnieje w MVP.

### Braki wykrywania

- W Pyodide polanon działa **bez NER** (`default_guards(with_ner=False)`; spaCy nie ma kół dla
  Pyodide). Wykrywanie imion i nazwisk opiera się na regułach: imię z listy plus pasujące
  nazwisko. Umyka m.in. samo nazwisko, nazwa miejscowości, nazwa firmy bez formy prawnej
  (`Sp. z o.o.`, `S.A.`), rzadkie i obce imiona, identyfikacja przez kontekst („dyrektor
  finansowy jedynej huty w Stalowej Woli”).
- Identyfikator z błędną sumą kontrolną (literówka w PESEL, NIP, IBAN) nie jest maskowany.
- Szczegóły: sekcja „What is not protected” w modelu zagrożeń polanon.

Odznaka z liczbą znalezionych danych może dawać fałszywe poczucie bezpieczeństwa: „0” znaczy „nic
nie wykryto”, nie „nic tu nie ma”. **Użytkownik musi przeczytać tekst przed wysłaniem.**

### Przycisk kopiowania w ChatGPT

Edytowalny blok w odpowiedzi ChatGPT ma przycisk kopiowania, który kopiuje wartość atrybutu
`data-markdown-copy-text`. AInonim tego atrybutu nie zmienia, więc skopiowany tekst zawiera
znaczniki, nie oryginały. To ograniczenie użyteczności, nie wyciek. To samo dotyczy innych dróg,
którymi strona czyta swoją wersję odpowiedzi (eksport, udostępnianie rozmowy, historia na
serwerze): tam zawsze są znaczniki.

### Luki w pokryciu pól

AInonim nie widzi albo nie zmienia tekstu w:

- polach w **zamkniętych** shadow root (zdarzenia z otwartych są znajdowane przez
  `composedPath()`),
- polach, których wartość skrypt strony ustawia bez zdarzeń `input`/`change`,
- edytorach rysowanych na `canvas` (np. Google Docs) i w ramkach `iframe` z innej domeny,
- tekstach dłuższych niż 50 000 znaków (nie są analizowane),
- **plikach i obrazach** wysyłanych do czatu: dokument, zrzut ekranu czy skan dowodu idą do
  dostawcy bez zmian. Nazwa pliku też nie jest sprawdzana.

Pola `input` i `textarea` nie mają podświetlenia wykrytych wartości (Custom Highlight API działa
tylko na węzłach tekstowych); odznaka i maskowanie działają.

### Zmiany selektorów w ChatGPT i Claude.ai

Adaptery stron (`lib/sites/chatgpt.ts`, `lib/sites/claude.ts`) opierają się na selektorach z
2026-11-20 z zapasowymi wariantami. Po zmianie znaczników na stronie:

- przywracanie może przestać działać (odpowiedzi zostają ze znacznikami: niewygodne, bez wycieku),
- edytor wiadomości może zostać uznany za zwykłe pole contenteditable albo pominięty,
- w najgorszym razie odpowiedź modelu może zostać potraktowana jak pole do analizy.

Ogólne wykrywanie pól (`input`, `textarea`, contenteditable) nie zależy od selektorów stron.
Przed wydaniem selektory sprawdza ręczna lista z [release.md](release.md).

### Przechowywanie mapowań

- Mapowania są w `storage.session`: w pamięci, znikają po zamknięciu przeglądarki (także po
  wyłączeniu lub aktualizacji rozszerzenia). Po tym czasie odpowiedzi zostają ze znacznikami.
- Najwyżej 50 rozmów; najdawniej używane są usuwane.
- Moduł `lib/mapping/store.ts` działa tylko w service workerze, a content script dostaje
  mapowanie przez wiadomości ze sprawdzeniem prefiksu strony.
- Mapowanie bieżącej rozmowy jest też w pamięci content scriptu (izolowany świat), bo przywracanie
  odbywa się w karcie.
- Poza zakresem: inne rozszerzenie z szerokimi uprawnieniami, złośliwe oprogramowanie na
  komputerze, osoba z dostępem do odblokowanej sesji przeglądarki i narzędzi deweloperskich. Mogą
  odczytać pamięć przeglądarki, DOM i treść pól niezależnie od AInonim.
- Ustawienia są w `storage.sync`: jeśli synchronizacja Chrome jest włączona, lista hostów z
  trybem innym niż domyślny trafia na konto Google użytkownika. Bez treści pól i mapowań.

### Łańcuch dostaw

- Pyodide (`pyodide` 314.0.8 z npm) i koło polanon (`vendor/polanon-0.4.1-py3-none-any.whl`, w
  repozytorium) są w paczce; nic nie jest ładowane z CDN w czasie działania.
- Wszystkie zależności npm są w `devDependencies` z dokładnymi wersjami i `package-lock.json`;
  do paczki trafia kod zbundlowany przez WXT/Vite oraz skopiowane pliki Pyodide. Kompromitacja
  narzędzia budującego albo paczki npm w chwili instalacji nadal jest możliwa; ogranicza ją
  lock-file i przegląd diffu przed wydaniem (`docs/release.md`, sekcja 3).
- CSP stron rozszerzenia: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`.
  `wasm-unsafe-eval` jest potrzebne dla WebAssembly; `unsafe-eval` nie jest włączone, więc ścieżki
  Emscripten z `eval` nie działają (zob. [spike T2](spikes/T2-pyodide.md)).
- Kod Pythona wykonywany w Pyodide to tylko polanon i `python/ainonim_bridge.py`; tekst
  użytkownika jest przekazywany jako dane (JSON), nie jako kod.
- Mostek testowy (`entrypoints/test-bridge.content.ts`, `window.postMessage` na `localhost`) jest
  budowany tylko w trybie `--mode e2e`; `scripts/check-production-build.js` przerywa `npm run build`,
  jeśli trafiłby do paczki.

### Prawo

Maskowanie to pseudonimizacja, nie anonimizacja w rozumieniu RODO. Rozszerzenie samo w sobie nie
zapewnia zgodności przetwarzania z przepisami. Treść wysłana do dostawcy AI (także ze
znacznikami i kontekstem) jest przetwarzana na jego zasadach.

## Ryzyko szczątkowe

Właściwy model myślowy: „do dostawcy trafia znacznie mniej danych osobowych”, nie „nie trafia
nic”. AInonim pomaga przy tekście, który użytkownik świadomie zamaskował, i tylko w polach, które
widzi.

## Zgłaszanie

Sposób na to, żeby wartość ze znacznikiem trafiła do wysyłanego tekstu, żeby strona dostała
mapowanie przez API rozszerzenia albo żeby rozszerzenie wysłało cokolwiek do sieci, to błąd
bezpieczeństwa. Prosimy o zgłoszenie prywatnie (adres kontaktowy w
[polityce prywatności](privacy-policy.md)), nie w publicznym zgłoszeniu.
