# Changelog

Wszystkie istotne zmiany w AInonim. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersje: [SemVer](https://semver.org/lang/pl/).

## [Unreleased]

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

[Unreleased]: https://github.com/dkoryto/ainonim/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/dkoryto/ainonim/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/dkoryto/ainonim/releases/tag/v0.0.1
