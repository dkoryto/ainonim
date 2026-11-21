# Changelog

Wszystkie istotne zmiany w AInonim. Format: [Keep a Changelog](https://keepachangelog.com/pl/1.1.0/),
wersje: [SemVer](https://semver.org/lang/pl/).

## [Unreleased]

### Dodane

- Panel z listą znalezionych danych (wartość, typ, znacznik) i polem wyboru przy każdej pozycji;
  „Zamaskuj zaznaczone (N)” maskuje tylko zaznaczone. Powtórzona wartość ma jeden wiersz.
- Odznaczenie pozycji usuwa jej podkreślenie w polu.
- Każdy wykryty fragment ma w odpowiedzi silnika swój znacznik (`token`).

### Zmienione

- Panel stoi nad polem (albo pod nim, gdy brak miejsca) i nie zasłania wpisywanego tekstu.
- Maskowanie nic nie zapisuje, gdy tekst zmienił się od analizy.

### Poprawione

- Tekst wklejony do edytora Claude.ai (ProseMirror) jest od razu analizowany; wcześniej dopiero
  po wpisaniu kolejnego znaku.

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

[Unreleased]: https://github.com/dkoryto/ainonim/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/dkoryto/ainonim/releases/tag/v0.0.1
