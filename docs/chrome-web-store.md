# Automatyczne wysyłanie do Chrome Web Store

Job `store` w `.github/workflows/release.yml` wysyła zip z wydania GitHub do Chrome Web Store i
zgłasza go do weryfikacji (Chrome Web Store API v2,
[dokumentacja](https://developer.chrome.com/docs/webstore/using-api)). Robi to skrypt
`scripts/cws-publish.ts`.

Job działa tylko wtedy, gdy jednocześnie:

- tag to wersja bez sufiksu (`v0.6.0`, nie `v0.6.0-rc.1`),
- wydanie GitHub zostało opublikowane, czyli przeszły wszystkie kontrole z `docs/release.md`,
- zmienna repozytorium `CWS_ENABLED` ma wartość `true`,
- ktoś z listy recenzentów zatwierdził środowisko `chrome-web-store` w przebiegu workflow.

Dopóki `CWS_ENABLED` nie jest ustawione, job jest pomijany, a zip wysyła się ręcznie (sekcja 7 w
`docs/release.md`).

## Konfiguracja (jednorazowo)

### 1. Pierwsza wersja ręcznie

API nie tworzy nowych pozycji w sklepie. Pierwszą wersję prześlij w
[Developer Dashboard](https://chrome.google.com/webstore/devconsole) i wypełnij zakładki z opisem
sklepu i prywatnością (`docs/store-listing.md`).

### 2. Google Cloud: API i klient OAuth

1. Utwórz projekt w [Google Cloud Console](https://console.cloud.google.com/) i włącz w nim
   **Chrome Web Store API**.
2. Ekran zgody OAuth: typ **External**, dodaj swój adres jako użytkownika testowego. Potem
   przełącz status publikacji na **In production**: w stanie „Testing” Google unieważnia refresh
   token po 7 dniach i job zacznie kończyć się błędem `invalid_grant`.
3. Utwórz klienta OAuth typu **Web application** z adresem przekierowania
   `https://developers.google.com/oauthplayground`. Zapisz client ID i client secret.

Konto Google musi mieć włączoną weryfikację dwuetapową.

### 3. Refresh token

1. Otwórz [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), w ustawieniach
   (koło zębate) zaznacz „Use your own OAuth credentials” i wpisz client ID i secret.
2. W polu zakresów wpisz `https://www.googleapis.com/auth/chromewebstore`, autoryzuj kontem,
   które jest właścicielem AInonim w Developer Dashboard, i wymień kod na tokeny.
3. Zapisz **refresh token**. Access tokenu nie trzeba: skrypt pobiera go sam przy każdym
   wysłaniu.

### 4. Identyfikatory z Developer Dashboard

- **Publisher ID**: „Publisher” → „Settings” (przy kilku wydawcach najpierw przełącz się na
  właściwego).
- **Extension ID** (32 znaki): zakładka „Package” pozycji AInonim.

### 5. GitHub

1. Settings → Environments → **New environment** `chrome-web-store`:
   - **Required reviewers**: Ty (każde wysłanie czeka na kliknięcie „Approve”),
   - **Deployment branches and tags**: tylko tagi `v*`.
2. W tym środowisku (nie w sekretach repozytorium) dodaj sekrety: `CWS_CLIENT_ID`,
   `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`.
3. Settings → Secrets and variables → Actions → **Variables**:
   - `CWS_ENABLED` = `true`,
   - opcjonalnie `CWS_PUBLISH_TYPE` = `STAGED_PUBLISH`: po zatwierdzeniu przez sklep wersja czeka
     na ręczne opublikowanie w Developer Dashboard. Domyślnie (`DEFAULT_PUBLISH`) publikuje się od
     razu po zatwierdzeniu.

To samo z wiersza poleceń (sekrety `gh` czyta ze standardowego wejścia, więc nie trafiają do
historii powłoki):

```
gh api -X PUT repos/<właściciel>/ainonim/environments/chrome-web-store
gh secret set CWS_REFRESH_TOKEN --env chrome-web-store
gh variable set CWS_ENABLED --body true
```

Recenzentów i ograniczenie do tagów najprościej ustawić w interfejsie GitHub.

## Wydanie z wysłaniem do sklepu

Po wypchnięciu tagu przebieg workflow „Release” zatrzymuje się na jobie `store` z prośbą o
zatwierdzenie (Actions → przebieg → „Review deployments”). Po zatwierdzeniu skrypt:

1. wymienia refresh token na access token,
2. wysyła zip (`:upload`); jeśli sklep przetwarza go asynchronicznie, czeka do 5 minut
   (`:fetchStatus`),
3. zgłasza wersję do weryfikacji (`:publish`) i wypisuje stan pozycji, zwykle `PENDING_REVIEW`,
   oraz ostrzeżenia sklepu.

Każdy błąd (zły token, wersja nie wyższa niż w sklepie, odrzucenie zgłoszenia) kończy job na
czerwono z kodem HTTP i opisem z API. Wydanie GitHub już wtedy istnieje; po poprawce można
ponowić sam job `store` („Re-run failed jobs”) albo wysłać zip ręcznie.

## Bezpieczeństwo

- Refresh token pozwala opublikować dowolną wersję wtyczki. Jest tylko w sekretach środowiska
  `chrome-web-store`, które wymaga zatwierdzenia i jest dostępne tylko dla tagów `v*`.
- Job nie instaluje zależności npm: sekrety widzi wyłącznie `scripts/cws-publish.ts` z
  otagowanego commitu i Node. Skrypt nigdy nie wypisuje tokenów, a z błędu endpointu tokenów
  pokazuje tylko kod HTTP i nazwę błędu (testy w `tests/unit/scripts/cws-publish.test.ts`).
- Unieważnienie: usuń dostęp aplikacji w
  [ustawieniach konta Google](https://myaccount.google.com/permissions) albo usuń klienta OAuth w
  Google Cloud, potem usuń sekrety i ustaw `CWS_ENABLED` na `false`.
