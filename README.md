# AInonim

Rozszerzenie Chrome (Manifest V3), które wykrywa polskie dane osobowe w polach tekstowych, zanim
trafią do czatu AI albo formularza. Wykrywaniem zajmuje się biblioteka
[polanon](https://github.com/boromat/polanon) uruchomiona w przeglądarce przez
[Pyodide](https://pyodide.org). Wszystko działa lokalnie: Pyodide i polanon są w paczce
rozszerzenia, nic nie jest pobierane z sieci.

Stan: szkielet projektu i spike T2 (Pyodide + polanon w dokumencie offscreen). Wyniki pomiarów:
[docs/spikes/T2-pyodide.md](docs/spikes/T2-pyodide.md).

## Jak to działa

```
content script ──runtime.sendMessage──▶ service worker ──runtime.sendMessage──▶ dokument offscreen
                                         (tworzy offscreen                      (Pyodide + polanon,
                                          przy pierwszym żądaniu)                python/ainonim_bridge.py)
```

Pyodide działa w dokumencie offscreen, bo service worker MV3 jest usypiany po ok. 30 s
bezczynności i interpreter trzeba by ładować od nowa.

W obecnym etapie content script działa tylko na `localhost` / `127.0.0.1` i służy testom e2e.

## Wymagania

- Node.js 22.12+ (CI: 24)
- do testów e2e: `npx playwright install chromium`
- do przebudowania koła polanon: Python 3.11+ i lokalne repozytorium polanon

## Polecenia

| Polecenie           | Co robi                                                              |
| ------------------- | -------------------------------------------------------------------- |
| `npm run dev`       | WXT w trybie deweloperskim                                           |
| `npm run build`     | buduje `.output/chrome-mv3`                                          |
| `npm run zip`       | buduje paczkę `.output/ainonim-<wersja>-chrome.zip`                  |
| `npm test`          | testy jednostkowe (Vitest)                                           |
| `npm run test:e2e`  | build + testy e2e (Playwright, Chromium z załadowanym rozszerzeniem) |
| `npm run measure`   | build + pomiary spike'u T2 (czas zimnego startu, opóźnienie)         |
| `npm run lint`      | ESLint + Prettier                                                    |
| `npm run typecheck` | `tsc --noEmit`                                                       |

Ręczne załadowanie: `chrome://extensions` → tryb dewelopera → „Załaduj rozpakowane” →
`.output/chrome-mv3`.

## polanon

Koło `vendor/polanon-0.4.1-py3-none-any.whl` jest w repozytorium, żeby build nie zależał od sieci
ani od lokalnego repo polanon. Przebudowanie z lokalnej kopii polanon:

```
./scripts/build-polanon-wheel.sh ../polanon
```

## Licencje

Zob. [NOTICE](NOTICE) (dołączany do paczki jako `NOTICE.txt`).
