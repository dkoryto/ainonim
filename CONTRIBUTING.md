# Zasady pracy z kodem AInonim

Krótko o tym, jak zmieniać kod, żeby zmiana przeszła CI i dała się utrzymać. Szczegóły struktury
są w [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), wydania w [docs/release.md](docs/release.md).

## Środowisko

- Node.js 24 (`.nvmrc`; minimum z `package.json`: 22.12). `npm ci` instaluje zależności i przez
  `postinstall` generuje typy WXT w `.wxt/`.
- Edytor powinien czytać `.editorconfig` (UTF-8, LF, 2 spacje, w Pythonie 4).

## Przed każdym commitem

```
npm run lint        # ESLint (z granicami lib/ i limitami rozmiaru) i Prettier
npm run typecheck
npm run test:coverage
```

Zmiana w zachowaniu na stronie, w komunikacji lub w buildzie: także `npm run test:e2e`.
`npm run format` poprawia formatowanie.

## Kod

- **Gdzie kod**: według kontekstu, w którym działa (content, background, offscreen, pages); wspólny
  bez API przeglądarki w `lib/shared/`. Reguły importów i miejsce na nowy kod: ARCHITECTURE.md.
- **`entrypoints/`** tylko łączy moduły z `lib/`. Logika, którą warto testować, idzie do `lib/`.
- **Rozmiar** (ESLint, `lib/` i `entrypoints/`): funkcja do 80 linii, plik do 400, złożoność
  cyklomatyczna do 15, zagnieżdżenie do 4. Gdy funkcja buduje cały widok albo sesję, wydziel
  czyste funkcje (obliczenia, budowanie DOM) i zostaw w niej samo wiązanie stanu ze zdarzeniami.
- **Typy**: TypeScript `strict` z `noUncheckedIndexedAccess`; ESLint `strictTypeChecked`. Bez
  `any` i bez `as` tam, gdzie wystarczy strażnik typu. Dane z wiadomości i `storage` sprawdzaj
  strażnikiem (`lib/shared/messages.ts`) przed użyciem.
- **Błędy w komunikacji** nie rzucają wyjątków: funkcje klienta zwracają `{ ok: true, … }` albo
  `{ ok: false, code, error }`.
- **Dane osobowe**: żadnych wartości ani znaczników w logach konsoli, dzienniku i komunikatach
  błędów (zob. `safeDetail` w `lib/content/masking.ts`). W testach tylko dane fikcyjne.
- **Sieć**: rozszerzenie niczego nie pobiera ani nie wysyła. Nowy `fetch`, uprawnienie lub host w
  manifeście wymaga aktualizacji `docs/THREAT_MODEL.md` i `docs/privacy-policy.md`.
- **Komentarze** wyjaśniają, dlaczego, nie co. Kod i komentarze po angielsku, dokumentacja i
  teksty interfejsu po polsku.

## Testy

- Test modułu `lib/<obszar>/<moduł>.ts` jest w `tests/unit/<obszar>/<moduł>.test.ts`. Nowy moduł
  dostaje nowy plik testu. Wyjątek: moduł wydzielony z większego (np. `badge-*.ts` z `badge.ts`)
  może być testowany przez API modułu, z którego go wydzielono, jeśli spełnia progi pokrycia.
- Progi pokrycia (`vitest.config.ts`): łącznie 95% instrukcji, funkcji i linii, 90% gałęzi; każdy
  plik co najmniej 85% instrukcji i 75% gałęzi.
- Testy sprawdzają zachowanie przez publiczne API modułu, nie jego wnętrze.

## Commity i gałęzie

- Praca na gałęzi (`feat/…`, `fix/…`, `refactor/…`, `docs/…`, `test/…`, `chore/…`), scalanie do
  `main`.
- Wiadomości w stylu [Conventional Commits](https://www.conventionalcommits.org/):
  `typ(zakres): opis`, np. `fix(sites): …`, `refactor(content): …`. Jeden commit to jedna
  logiczna zmiana.
- Zmiana widoczna dla użytkownika: wpis w `CHANGELOG.md` (sekcja `[Unreleased]`) i podbicie wersji
  przy wydaniu.

## Zależności

- Wersje w `package.json` są przypięte dokładnie (bez `^`). Dependabot co tydzień proponuje
  aktualizacje npm i akcji GitHub (akcje są przypięte do SHA).
- Nowa zależność trafiająca do paczki rozszerzenia: wpis w `NOTICE` i przegląd licencji.
