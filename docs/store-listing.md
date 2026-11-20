# Chrome Web Store: teksty wpisu

Teksty do formularza w Chrome Web Store Developer Dashboard. Polska wersja jest główna; angielska
poniżej. Krótki opis w sklepie pochodzi z pola `description` manifestu (`wxt.config.ts`), więc
przed wysłaniem paczki oba teksty muszą być zgodne.

---

## Polski

### Nazwa

AInonim

### Krótki opis (127 znaków, limit 132)

```
Wykrywa i maskuje polskie dane osobowe (PESEL, NIP, IBAN, imiona) w czatach AI i formularzach. Działa lokalnie, nic nie wysyła.
```

### Opis szczegółowy

```
AInonim pokazuje, ile i jakich polskich danych osobowych jest w polu tekstowym, zanim wyślesz je do czatu AI albo formularza, i jednym kliknięciem zastępuje je znacznikami.

Co wykrywa:
• PESEL, NIP, REGON, numer dowodu osobistego, IBAN, numer karty płatniczej (sprawdzane sumą kontrolną),
• e-mail, telefon, kod pocztowy,
• imiona z nazwiskami w każdym przypadku gramatycznym, nazwy firm,
• sekrety, np. klucze API.

Jak działa:
• Odznaka przy edytowanym polu pokazuje liczbę i rodzaje znalezionych danych.
• Jedno kliknięcie zamienia je na znaczniki, np. „Jan Kowalski” → <OSOBA_1>.
• W ChatGPT i Claude.ai oryginały wracają w odpowiedzi modelu, tylko na Twoim ekranie.
• Pola haseł, kart i kodów jednorazowych są pomijane.
• Dla każdej strony możesz wybrać: ostrzegaj albo wyłączone.

Prywatność:
• Wykrywanie działa w całości w przeglądarce: otwarta biblioteka polanon (MIT) uruchomiona przez Pyodide (WebAssembly), dołączona do paczki.
• Rozszerzenie nie wysyła niczego na żaden serwer. Bez telemetrii, analityki i kont.
• Mapowania znacznik → oryginał są w pamięci sesji i znikają po zamknięciu przeglądarki.

Ograniczenia:
• To pseudonimizacja, nie anonimizacja w rozumieniu prawa.
• Żaden detektor nie wykrywa wszystkiego; np. samo nazwisko albo nazwa miejscowości często umyka. Przeczytaj tekst przed wysłaniem.
```

### Jedyny cel (single purpose)

```
Wykrywanie polskich danych osobowych w polu tekstowym, które użytkownik edytuje, i zastępowanie ich znacznikami przed wysłaniem, w całości lokalnie w przeglądarce.
```

### Uzasadnienie uprawnień

| Uprawnienie                    | Uzasadnienie                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offscreen`                    | Wykrywanie wykonuje biblioteka polanon w Pyodide (WebAssembly). Działa w dokumencie offscreen, bo service worker MV3 jest usypiany po ok. 30 s bezczynności i interpreter trzeba by ładować od nowa. |
| `storage`                      | `chrome.storage.session`: mapowania znacznik → oryginał na czas sesji przeglądarki (potrzebne do pokazania oryginałów w odpowiedzi). `chrome.storage.sync`: tryb dla stron (nazwa hosta + tryb).     |
| `activeTab`                    | Działanie na bieżącej karcie po kliknięciu ikony rozszerzenia przez użytkownika.                                                                                                                     |
| Dostęp do stron (`<all_urls>`) | Pola tekstowe, w które użytkownik może wpisać dane osobowe, są na dowolnych stronach, nie tylko w czatach AI. Skrypt treści czyta tylko pole, które użytkownik edytuje; nic nie wysyła.              |

### Zdalny kod

```
Nie. Cały kod, w tym Pyodide (WebAssembly) i biblioteka polanon, jest w paczce rozszerzenia. Nic nie jest pobierane ani wykonywane z sieci.
```

### Wykorzystanie danych (formularz „Prywatność”)

Dane obsługiwane przez rozszerzenie (wyłącznie lokalnie, bez przesyłania poza urządzenie):

- informacje umożliwiające identyfikację osoby (imiona i nazwiska, PESEL, numer dowodu, e-mail,
  telefon, kod pocztowy),
- informacje finansowe i płatnicze (IBAN, numer karty płatniczej),
- dane uwierzytelniające (sekrety, np. klucze API, jeśli są w tekście pola),
- komunikacja osobista i treść stron (tekst wpisywany w pola).

Uwaga: dane nie opuszczają urządzenia, ale rozszerzenie je czyta, więc powyższe kategorie
deklarujemy zachowawczo, żeby wpis był zgodny z rzeczywistym działaniem.

Zaznaczyć wszystkie trzy oświadczenia:

- dane nie są sprzedawane ani przekazywane stronom trzecim poza zatwierdzonymi przypadkami użycia,
- dane nie są używane ani przekazywane w celach niezwiązanych z jedynym celem rozszerzenia,
- dane nie są używane ani przekazywane w celu ustalania zdolności kredytowej ani udzielania pożyczek.

Adres polityki prywatności: opublikowana wersja `docs/privacy-policy.md` ([adres URL polityki]).

### Zrzuty ekranu (1280×800)

Pliki w `assets/store/`, generowane z prawdziwym rozszerzeniem (build e2e) przez
`npm run screenshots` (`scripts/screenshots.js`, strony w `scripts/screenshot-pages/`). Strony są
lokalne i neutralne: czat jest podstawiony pod adres `chatgpt.com` tylko po to, żeby zadziałał
adapter czatu, ale nie naśladuje wyglądu żadnego serwisu. Odpowiedź „modelu” na zrzucie 3 wstawia
skrypt (tak jak testy e2e); przywrócenie oryginałów w niej robi już rozszerzenie. Popup na zrzucie 5
to prawdziwa strona popupu; skrypt podaje jej tylko adres karty, bo popup otwarty ze skryptu nie
dostaje `activeTab`.

1. `screenshot-1-badge.png`: wiadomość w czacie z „Jan Kowalski”, PESEL i IBAN-em, podkreślone
   wartości i odznaka „3 · IBAN, osoba, PESEL” z przyciskiem „Zamaskuj”.
   Podpis: „Widzisz dane osobowe, zanim je wyślesz”.
2. `screenshot-2-masked.png`: ta sama wiadomość po kliknięciu „Zamaskuj”: `<OSOBA_1>`,
   `<PESEL_1>`, `<IBAN_1>`.
   Podpis: „Jedno kliknięcie zamienia dane na znaczniki”.
3. `screenshot-3-restored.png`: wysłana wiadomość ze znacznikami i odpowiedź, w której widać
   „Janie Kowalski” i numer konta zamiast znaczników.
   Podpis: „Oryginały wracają w odpowiedzi, tylko na Twoim ekranie”.
4. `screenshot-4-form.png`: formularz zwrotu w sklepie, pole „Uwagi” z IBAN-em i e-mailem i odznaka
   „2 · e-mail, IBAN”; wypełnione pole hasła nie ma odznaki.
   Podpis: „Działa w każdym polu tekstowym, nie tylko w czatach”.
5. `screenshot-5-site-switch.png`: popup nad tym formularzem z wyborem „Ostrzegaj / Wyłączone” dla
   `sklep.example.pl`.
   Podpis: „Ty decydujesz, na których stronach działa”.

Mały kafelek promocyjny (440×280): `assets/store/promo-440x280.png`, generowany razem z ikonami
przez `node scripts/render-icons.js` z `assets/icon.svg`.

Wszystkie dane na zrzutach muszą być fikcyjne.

---

## English

### Name

AInonim

### Short description (120 characters, limit 132)

```
Detects and masks Polish personal data (PESEL, NIP, IBAN, names) in AI chats and web forms. Runs locally, sends nothing.
```

### Detailed description

```
AInonim shows how many and which kinds of Polish personal data are in a text field before you send it to an AI chat or a form, and replaces them with tokens in one click.

What it detects:
• PESEL, NIP, REGON, Polish ID card number, IBAN, payment card number (verified by checksum),
• e-mail, phone, postal code,
• first names with surnames in every grammatical case, company names,
• secrets such as API keys.

How it works:
• A badge by the field shows the number and kinds of data found.
• One click replaces them with tokens, e.g. "Jan Kowalski" → <OSOBA_1>.
• In ChatGPT and Claude.ai the originals are shown again in the model's answer, on your screen only.
• Password, card and one-time-code fields are skipped.
• Per site you choose: warn or off.

Privacy:
• Detection runs entirely in the browser: the open-source polanon library (MIT) run by Pyodide (WebAssembly), bundled in the package.
• The extension sends nothing to any server. No telemetry, no analytics, no accounts.
• Token → original mappings are kept in session memory and cleared when the browser closes.

Limits:
• This is pseudonymisation, not legal anonymisation.
• No detector catches everything; e.g. a surname alone or a city name is often missed. Read your text before sending.
```

### Single purpose

```
Detecting Polish personal data in the text field the user is editing and replacing it with tokens before sending, entirely locally in the browser.
```

### Permission justifications

| Permission                 | Justification                                                                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offscreen`                | Detection is done by the polanon library in Pyodide (WebAssembly). It runs in an offscreen document because the MV3 service worker is suspended after ~30 s idle and would have to reload the interpreter. |
| `storage`                  | `chrome.storage.session`: token → original mappings for the browser session (needed to show originals in the answer). `chrome.storage.sync`: per-site mode (hostname + mode).                              |
| `activeTab`                | To act on the current tab when the user clicks the extension icon.                                                                                                                                         |
| Host access (`<all_urls>`) | Text fields where users may type personal data exist on any site, not only AI chats. The content script reads only the field being edited and sends nothing.                                               |

### Remote code

```
No. All code, including Pyodide (WebAssembly) and the polanon library, is in the extension package. Nothing is downloaded or executed from the network.
```

### Data usage (Privacy form)

Data types handled (locally only, never transmitted off the device): personally identifiable
information; financial and payment information; authentication information (secrets in field
text); personal communications and website content (text typed into fields).

Tick all three certifications: not sold or transferred to third parties outside approved use cases;
not used or transferred for purposes unrelated to the single purpose; not used or transferred to
determine creditworthiness or for lending.

Privacy policy URL: published version of `docs/privacy-policy.md` ([privacy policy URL]).

### Screenshot captions

1. "See personal data before you send it"
2. "One click replaces it with tokens"
3. "Originals come back in the answer, on your screen only"
4. "Works in any text field, not only AI chats"
5. "You choose the sites where it runs"
