# Changelog

Wszystkie istotne zmiany w AInonim. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersje: [SemVer](https://semver.org/lang/pl/).

## [Unreleased]

## [0.4.0] - 2026-11-22

### Dodane

- Tryb „Automatycznie podczas pisania”: po chwili przerwy w pisaniu (ok. 1,5 s) pole maskuje się
  samo, bez klikania „Zamaskuj zaznaczone”, na każdej stronie, na której działa AInonim. „Cofnij”
  działa jak zwykle; w czatach dodatkowo zostaje maskowanie przy wysyłce. Trzy tryby w ustawieniach
  i w okienku: Ręcznie, Przy wysyłce, Przy pisaniu.
- Domyślne zastąpienie dla każdej kategorii („znacznik” albo „ogólnie”) w zakładce „Kategorie”,
  także dla własnych słów; panel i maskowanie automatyczne zaczynają od tego ustawienia.
- Zakładka „Strony”: AInonim działa na wszystkich stronach, tylko w czatach AI albo tylko na
  stronach z Twojej listy (także `*.domena`); lista wyłączonych stron. Okienko mówi, czy wtyczka
  działa na bieżącej stronie, i pozwala dodać ją do listy.
- Kimi, DeepSeek, Mistral Le Chat, Microsoft Copilot i Qwen (pola wiadomości sprawdzone na żywo
  tam, gdzie strona je pokazuje bez konta; odpowiedzi według znanej budowy stron).
- „Podoba Ci się AInonim? Oceń · Poleć znajomym” w okienku i w zakładce „O autorze”; link „Postaw
  kawę autorowi” pojawi się po ustawieniu adresu.

## [0.3.4] - 2026-11-22

### Zmienione

- Przygotowanie do Chrome Web Store: nowa polityka prywatności (PL i EN) zgodna z obecnym
  przetwarzaniem danych, z oświadczeniem Limited Use; zaktualizowany opis do sklepu z
  uzasadnieniami uprawnień; sześć nowych zrzutów ekranu 1280×800.
- Paczka nie zawiera już nieużywanego adresu CDN z Pyodide; kontrola paczki wykrywa adresy CDN.

## [0.3.3] - 2026-11-21

### Zmienione

- Komunikat o błędzie analizy nigdy nie jest pusty: podaje etap (strona, service worker,
  dokument z silnikiem), nazwę błędu i ostatnią linię komunikatu, np.
  „worker:create-offscreen: Error: …”. Ułatwia to znalezienie przyczyny `engine`.

## [0.3.2] - 2026-11-21

### Zmienione

- Przy nieudanej analizie konsola strony pokazuje oprócz kodu błędu jego treść, chyba że zawiera
  choć jedno słowo analizowanego tekstu; wtedy „[szczegóły ukryte]”. Ułatwia to diagnozę.

## [0.3.1] - 2026-11-21

### Zmienione

- Zakładka „O autorze” nie pokazuje już wiersza „Silnik” z linkiem do polanon.

## [0.3.0] - 2026-11-21

### Dodane

- Gemini, Grok i Perplexity: wykrywanie w polu wiadomości, przywracanie oryginałów w
  odpowiedziach i wysłanych wiadomościach, zapamiętane dane i tryb automatyczny, jak w ChatGPT
  i Claude.ai. Gemini sprawdzony na żywej stronie, Grok częściowo (odpowiedzi wymagają konta),
  Perplexity według znanej budowy strony.
- Strona ustawień (link „Ustawienia” w okienku wtyczki) z zakładkami: Ogólne, Kategorie, Własne
  słowa, Dziennik, O autorze.
- Maskowanie automatyczne przy wysyłce (Ogólne, także przełącznik w okienku): Enter albo przycisk
  wysyłania w czacie najpierw zamienia znalezione dane na znaczniki, potem wysyła. Gdy analiza się
  nie uda, wiadomość nie wychodzi; drugie wysłanie w ciągu 5 s idzie bez maskowania.
- Kategorie: każdy rodzaj danych (osoba, PESEL, e-mail, adres…) można wyłączyć; wyłączone nie są
  pokazywane, maskowane ani zapamiętywane.
- Własne słowa: słowa, frazy i wyrażenia regularne do maskowania jako `<SLOWO_1>`, `<SLOWO_2>`…,
  z eksportem i importem listy (JSON) oraz „Usuń wszystkie”. Lista zostaje w ustawieniach
  przeglądarki (synchronizowanych z kontem).
- Dziennik maskowania: kiedy, na jakiej stronie, ręcznie czy automatycznie i ile danych jakiego
  rodzaju zamaskowano, bez treści i samych danych. Podsumowanie, eksport CSV, raport do
  zapisania jako PDF, czyszczenie; zapisywanie można wyłączyć.
- Zakładka „O autorze”.

### Zmienione

- Ikona po automatycznym maskowaniu pokazuje niebieską liczbę i „zamaskowano automatycznie (N)”.

### Poprawione

- Ukryte pole schowka edytora Quill (Gemini i inne strony) nie jest już traktowane jak pole
  tekstowe.

### Bezpieczeństwo

- Wpisy dziennika dopisuje tylko service worker; host bierze z adresu karty, czas z własnego
  zegara, a skrypt na stronie nie może dziennika odczytać. Eksport CSV neutralizuje formuły.
- Własne wzorce mają limity (długość, liczba wpisów i trafień); wzorce z zagnieżdżonymi
  powtórzeniami i dopasowujące pusty tekst są odrzucane.

## [0.2.0] - 2026-11-21

### Dodane

- Przełącznik w okienku wtyczki „W odpowiedziach czatu pokazuj: Oryginały | Znaczniki”. Przy
  „Znacznikach” odpowiedzi i wysłane wiadomości zostają ze znacznikami (`<OSOBA_1>`), które są
  podświetlone; prawdziwą wartość widać po najechaniu („<OSOBA_1> = Jan Kowalski”). Zmiana działa
  od razu w otwartych kartach.

### Zmienione

- Komunikat o błędzie w sekcji „Zapamiętane dane” podpowiada, że po aktualizacji wtyczkę trzeba
  przeładować w chrome://extensions i odświeżyć karty z czatem (wtedy działa jeszcze stary
  service worker, który nie zna nowych poleceń).

## [0.1.0] - 2026-11-21

### Dodane

- Ikona AInonim w rogu pola: pokazuje stan (analiza, liczba znalezionych danych, brak danych,
  błąd) i otwiera panel. Esc zamyka panel.
- Panel z listą znalezionych danych (wartość, typ, znacznik) i polem wyboru przy każdej pozycji;
  „Zamaskuj zaznaczone (N)” maskuje tylko zaznaczone. Powtórzona wartość ma jeden wiersz.
- Przełącznik „znacznik | ogólnie” przy każdej pozycji: zamiast znacznika można wstawić wartość
  uogólnioną regułami (data → rok, adres → miasto, PESEL → „[PESEL]” itd.). Uogólnionych wartości
  nie zapamiętuje się i nie przywraca.
- „Cofnij” przywraca tekst sprzed ostatniego maskowania, dopóki pole go nie zmieniło.
- Oryginały w Twoich wysłanych wiadomościach w ChatGPT i Claude.ai, nie tylko w odpowiedziach.
- Przywrócone wartości są podświetlone na turkusowo; po najechaniu widać znacznik, który
  wysłano do modelu.
- Okienko wtyczki: sekcja „Zapamiętane dane” z parami znacznik → oryginał dla każdej rozmowy,
  „Usuń” i „Usuń wszystko”. Po usunięciu otwarte czaty przestają przywracać te wartości.
- Każdy wykryty fragment ma w odpowiedzi silnika swój znacznik (`token`).

### Zmienione

- Panel nie otwiera się sam, tylko z ikony; stoi nad polem (albo pod nim) i nie zasłania tekstu.
- Odznaczenie pozycji usuwa jej podkreślenie w polu.
- Maskowanie nic nie zapisuje, gdy tekst zmienił się od analizy.
- Okienko wtyczki ma 300 px szerokości.

### Poprawione

- Tekst wklejony do edytora Claude.ai (ProseMirror) jest od razu analizowany; wcześniej dopiero
  po wpisaniu kolejnego znaku.

### Bezpieczeństwo

- Listę i usuwanie zapamiętanych danych obsługują tylko strony wtyczki; skrypt na stronie
  dostaje odmowę (`forbidden`).

## [0.0.1] - 2026-11-20

Pierwsza wersja (MVP).

### Dodane

- Wykrywanie polskich danych osobowych (PESEL, NIP, REGON, IBAN, imiona i nazwiska w odmianie,
  adresy, telefony, e-maile i inne) regułami polanon w Pyodide, w całości lokalnie.
- Działa w każdym polu tekstowym na każdej stronie; poziom „Ostrzegaj”/„Wyłączone” dla strony
  w okienku wtyczki.
- Podkreślenie wykrytych danych i znaczek z przyciskiem „Zamaskuj” (znaczniki `<OSOBA_1>`).
- Przywracanie oryginałów w odpowiedziach ChatGPT i Claude.ai, z odmianą (`<OSOBA_1:wołacz>`).
- Mapowania znacznik → oryginał tylko w pamięci sesji service workera, z kontrolą dostępu per strona.
- Testy jednostkowe i e2e, w tym test, że dane nie opuszczają przeglądarki; CI na GitHub Actions.

[Unreleased]: https://github.com/dkoryto/ainonim/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/dkoryto/ainonim/compare/v0.3.4...v0.4.0
[0.3.4]: https://github.com/dkoryto/ainonim/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/dkoryto/ainonim/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/dkoryto/ainonim/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/dkoryto/ainonim/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/dkoryto/ainonim/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/dkoryto/ainonim/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/dkoryto/ainonim/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/dkoryto/ainonim/releases/tag/v0.0.1
