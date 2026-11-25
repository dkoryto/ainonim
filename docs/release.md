# Wydanie wersji: lista kontrolna

Kolejność ma znaczenie: paczkę wysyłamy dopiero po przejściu wszystkich punktów. Używaj tylko
fikcyjnych danych.

## 1. Wersja

- [ ] Ustal numer wersji (semver) i podbij `version` w `package.json` (WXT bierze z niego wersję
      manifestu): `npm version <x.y.z> --no-git-tag-version`.
- [ ] Sprawdź, że `description` w `wxt.config.ts` zgadza się z krótkim opisem w
      `docs/store-listing.md` (≤ 132 znaki).
- [ ] Jeśli zmieniła się wersja polanon lub Pyodide: zaktualizuj `NOTICE` i nazwę koła w `vendor/`.

## 2. Testy i pomiary

```
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run test:e2e
npm run build
npm run measure
```

- [ ] Wszystko zielone. `npm run test:coverage` to testy jednostkowe z progami pokrycia `lib/` z
      `vitest.config.ts` (łącznie 95% instrukcji, funkcji i linii, 90% gałęzi; każdy plik co
      najmniej 85% instrukcji i 75% gałęzi);
      `npm run test:e2e` obejmuje test prywatności (`tests/e2e/privacy.spec.ts`).
- [ ] `npm run measure` (po `npm run build`, żeby zmierzyć rozmiar paczki): zimny start < 3 s,
      ciepłe `analyze` (2000 znaków) < 100 ms, rozmiar `.output/chrome-mv3` < 15 MB. Porównaj z
      [docs/spikes/T2-pyodide.md](spikes/T2-pyodide.md); wyraźny wzrost wyjaśnij przed wydaniem.

## 3. Bezpieczeństwo

- [ ] Przegląd bezpieczeństwa diffu od poprzedniego tagu: `git diff v<poprzednia>..HEAD`. Szczególnie:
      nowe uprawnienia lub hosty w manifeście, każde `fetch`/`XMLHttpRequest`/`WebSocket`/
      `sendBeacon`, zmiany CSP, obsługa wiadomości (`sender`), wstawianie tekstu do stron
      (`innerHTML`), zapis do `chrome.storage`.
- [ ] `npm audit`: brak podatności high/critical w zależnościach trafiających do paczki.
- [ ] Nowe uprawnienie lub zmiana w przetwarzaniu danych → zaktualizuj
      `docs/privacy-policy.md` i `docs/store-listing.md`.

## 4. Testy ręczne

Zbuduj (`npm run build`) i załaduj `.output/chrome-mv3` w Chrome: `chrome://extensions` → tryb
dewelopera → „Załaduj rozpakowane”. Czysty profil.

Tekst testowy (fikcyjny):

```
Proszę o korektę faktury. Klient: Jan Kowalski, PESEL 50810112354, e-mail jan.kowalski@example.com.
```

### ChatGPT (chatgpt.com)

- [ ] Wklej tekst do edytora. Odznaka pokazuje znalezione dane (co najmniej osoba, PESEL, e-mail).
- [ ] Kliknij „zamaskuj”: w edytorze są znaczniki (`<OSOBA_1>`, `<PESEL_1>` …), brak oryginałów.
- [ ] Wyślij z prośbą „Napisz krótki e-mail do klienta, zwróć się do niego po imieniu”. W odpowiedzi
      na ekranie widać „Jan Kowalski” zamiast `<OSOBA_1>`, także gdy odpowiedź jest w osobnym bloku
      edytora („E-mail”).
- [ ] Odśwież stronę po zamknięciu i ponownym otwarciu przeglądarki: oryginały nie wracają
      (mapowanie wyczyszczone).

### Claude.ai

- [ ] Te same kroki co w ChatGPT (edytor `div.tiptap.ProseMirror`).

### Zwykły formularz

- [ ] Na dowolnej stronie z formularzem (lub lokalnym pliku HTML z `input`, `textarea` i
      `div contenteditable`) wpisz tekst testowy w każde pole: odznaka pojawia się przy każdym.
- [ ] Pole `type="password"`, pole numeru karty (`autocomplete="cc-number"`) i kodu jednorazowego
      (`autocomplete="one-time-code"`): wpisz PESEL 50810112354, odznaki brak.
- [ ] Przełącz stronę na „wyłączone”: odznaka znika; z powrotem na „ostrzegaj”: wraca.

## 5. Prywatność

- [ ] DevTools → Network na stronie testowej, filtr wyłączony, „Preserve log” włączone. Wpisz i
      zamaskuj tekst testowy (nie wysyłaj formularza): żadne żądanie nie zawiera `50810112354`
      ani `Kowalski` (wyszukiwanie Ctrl/Cmd+F w panelu Network przeszukuje też treść żądań).
- [ ] To samo dla service workera i dokumentu offscreen: `chrome://extensions` → AInonim →
      „Sprawdź widoki” → DevTools → Network. Oczekiwane: tylko pliki z `chrome-extension://`
      (Pyodide, koło polanon), zero żądań do sieci.
- [ ] `chrome://extensions` → Szczegóły: uprawnienia zgadzają się z `docs/store-listing.md`.

## 6. Paczka

Paczkę do sklepu buduje GitHub Actions (`.github/workflows/release.yml`), nie lokalny komputer,
więc zawsze powstaje z czystego `npm ci` i z kodu oznaczonego tagiem.

- [ ] `CHANGELOG.md` ma sekcję `## [<x.y.z>]` (z niej powstają notatki wydania), zmiany są w
      `main`, CI jest zielone.
- [ ] Tag:

  ```
  git tag -a v<x.y.z> -m "AInonim <x.y.z>"
  git push origin v<x.y.z>
  ```

- [ ] Workflow „Release” (zakładka Actions) jest zielony. Kolejno:
  1. `verify`: całe CI (`ci.yml`): lint, typecheck, testy jednostkowe z pokryciem, build, e2e z
     testem prywatności i pomiary;
  2. `package`: zgodność tagu z `version` w `package.json`, `npm run zip`, kontrola zipa (jest
     `manifest.json` z tą samą wersją, `NOTICE.txt` i teksty licencji w `licenses/`, nie ma map
     źródeł, `.env` ani plików testów) i test „smoke” rozpakowanego zipa w Chromium
     (`tests/e2e/package-smoke.spec.ts`: wpisanie danych, panel, maskowanie, cofnięcie);
  3. `release`: wydanie GitHub z zipem, sumą SHA-256 i notatkami z sekcji CHANGELOG.

  Jeśli któryś krok nie przejdzie, wydanie nie powstaje.

- [ ] Pobierz zip z wydania i sprawdź sumę: `sha256sum -c ainonim-<x.y.z>-chrome.zip.sha256`.

Paczka bez wydania, np. do sprawdzenia gałęzi: Actions → Release → Run workflow, zip jest w
artefaktach przebiegu przez 30 dni. Lokalnie nadal działa `npm run zip`.

## 7. Wysłanie do Chrome Web Store

**Automatycznie** (gdy skonfigurowane, zob. [chrome-web-store.md](chrome-web-store.md)): przebieg
„Release” czeka na jobie `store`; zatwierdź go („Review deployments”). Job wysyła zip z wydania i
zgłasza wersję do weryfikacji; w logu jest stan pozycji (zwykle `PENDING_REVIEW`).

**Ręcznie** (bez konfiguracji albo gdy job `store` zawiedzie):
[Developer Dashboard](https://chrome.google.com/webstore/devconsole) → AInonim → „Pakiet” →
prześlij zip z wydania GitHub i wyślij do weryfikacji.

W obu przypadkach:

1. „Informacje o produkcie”: sprawdź opisy i zrzuty ekranu z `docs/store-listing.md` (API zmienia
   tylko paczkę, nie opis).
2. „Prywatność”: jedyny cel, uzasadnienia uprawnień, zdalny kod, wykorzystanie danych i adres
   polityki prywatności zgodne z `docs/store-listing.md`.
3. Zanotuj datę wysłania.

## 8. Gdy sklep odrzuci paczkę

Popraw, podbij wersję i zacznij od punktu 1. Wydanie odrzuconej wersji oznacz w opisie albo usuń
razem z tagiem (`gh release delete v<x.y.z> --cleanup-tag`).
