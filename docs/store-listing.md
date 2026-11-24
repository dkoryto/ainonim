# Chrome Web Store: teksty wpisu

Teksty do formularza w Chrome Web Store Developer Dashboard dla bieżącej wersji. Polska wersja jest
główna; angielska poniżej (panel dewelopera jest po angielsku, więc uzasadnienia uprawnień i
odpowiedzi w zakładce „Privacy practices” wpisuje się po angielsku). Krótki opis w sklepie pochodzi
z pola `description` manifestu (`wxt.config.ts`), więc oba teksty muszą być zgodne.

Wszystko, co oznaczono `[[DO UZUPEŁNIENIA: …]]`, uzupełnia właściciel konta wydawcy.

---

## Polski

### Nazwa

AInonim

### Krótki opis (127 znaków, limit 132)

Ten sam tekst co `description` w `wxt.config.ts`:

```
Wykrywa i maskuje polskie dane osobowe (PESEL, NIP, IBAN, imiona) w czatach AI i formularzach. Działa lokalnie, nic nie wysyła.
```

### Opis szczegółowy

```
AInonim pokazuje, jakie polskie dane osobowe są w polu tekstowym, zanim wyślesz je do czatu AI albo formularza, i zastępuje je znacznikami, np. „Jan Kowalski” → <OSOBA_1>.

Co wykrywa:
• PESEL, NIP, REGON, KRS, numer dowodu osobistego, paszportu i prawa jazdy, IBAN, numer karty płatniczej (numery sprawdzane sumą kontrolną),
• e-mail, telefon, adres, kod pocztowy, adres IP, numer rejestracyjny, VIN,
• imiona i nazwiska w każdym przypadku gramatycznym, nazwy firm, daty,
• sekrety, np. klucze API,
• Twoje własne słowa i wzorce, np. nazwy projektów albo numery klientów.

Jak działa:
• Ikona w rogu pola pokazuje, ile danych znaleziono. Kliknięcie otwiera panel z listą wartości.
• W panelu zaznaczasz, co zamaskować, i dla każdej wartości wybierasz znacznik albo opis ogólny (np. sam rok zamiast pełnej daty). „Cofnij” przywraca tekst sprzed maskowania.
• W czatach AI możesz włączyć maskowanie automatyczne przy wysyłce wiadomości.
• W odpowiedziach czatu i w wysłanych wiadomościach widzisz z powrotem oryginały zamiast znaczników; po najechaniu kursorem widać, co trafiło do modelu. Możesz też zostawić na ekranie znaczniki.
• Pola haseł, kart i kodów jednorazowych są pomijane.
• Dla każdej strony wybierasz: ostrzegaj albo wyłączone. W ustawieniach wyłączysz kategorie, których nie chcesz wykrywać.
• Dziennik maskowania zapisuje tylko liczby (kiedy, na jakiej stronie, ile danych jakiego rodzaju), nigdy samych danych. Można go wyeksportować do CSV, wydrukować jako raport albo wyłączyć.

Obsługiwane czaty: przywracanie oryginałów i maskowanie przy wysyłce działają w ChatGPT, Claude, Gemini, Grok, Perplexity, Kimi, DeepSeek, Mistral Le Chat, Microsoft Copilot i Qwen. Wykrywanie i ręczne maskowanie działają w polach tekstowych na każdej stronie. AInonim nie jest powiązany z OpenAI, Anthropic, Google, xAI, Perplexity, Moonshot AI, DeepSeek, Mistral AI, Microsoft ani Alibaba.

Prywatność:
• Wykrywanie działa w całości w przeglądarce: otwarta biblioteka polanon uruchomiona przez Pyodide (WebAssembly), dołączona do paczki rozszerzenia.
• Rozszerzenie nie wysyła niczego na żaden serwer. Bez telemetrii, analityki i kont.
• Pary znacznik → oryginał są w pamięci sesji przeglądarki i znikają po jej zamknięciu; możesz je też usunąć w okienku rozszerzenia.

Ograniczenia:
• To pseudonimizacja, nie anonimizacja w rozumieniu prawa.
• Żaden detektor nie wykrywa wszystkiego. Przeczytaj tekst przed wysłaniem.
• Pliki i obrazy dołączane do wiadomości nie są sprawdzane.
```

### Kategoria

Proponowana: **Privacy & Security** (Prywatność i bezpieczeństwo, w grupie „Make Chrome Yours”).
Zapasowa: **Tools** (Narzędzia).

Język wpisu: polski.

### Jedyny cel (single purpose)

```
Ochrona polskich danych osobowych w tekście, który użytkownik wpisuje w przeglądarce: wykrywanie ich w edytowanym polu i zastępowanie znacznikami przed wysłaniem (z przywróceniem oryginałów na ekranie użytkownika w czatach AI), w całości lokalnie.
```

### Uzasadnienie uprawnień

| Uprawnienie                                                                    | Uzasadnienie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `offscreen`                                                                    | Wykrywanie wykonuje biblioteka polanon w Pyodide (WebAssembly), dołączonym do paczki. Działa w dokumencie offscreen, bo service worker MV3 jest usypiany po bezczynności i interpreter trzeba by ładować od nowa przy każdym wybudzeniu; skrypty treści nie mogą go uruchomić, bo działają w kontekście strony. Dokument offscreen przyjmuje polecenia tylko od service workera rozszerzenia.                                                                                                |
| `storage`                                                                      | Trzy obszary: `storage.session`: pary znacznik → oryginał dla rozmów w czatach AI, potrzebne, żeby pokazać oryginały w odpowiedziach; tylko w pamięci, kasowane po zamknięciu przeglądarki, dostępne wyłącznie dla service workera. `storage.sync`: ustawienia (poziom dla stron, tryb maskowania, wyświetlanie, wyłączone kategorie, włączenie dziennika) i własne słowa użytkownika. `storage.local`: dziennik maskowania (czas, nazwa hosta, liczby według kategorii, bez samych danych). |
| `activeTab`                                                                    | Okienko rozszerzenia odczytuje adres bieżącej karty po kliknięciu ikony przez użytkownika, żeby pokazać ustawienie dla tej strony i dane zapamiętane w tej rozmowie. Bez uprawnienia `tabs` i bez dostępu do historii.                                                                                                                                                                                                                                                                       |
| Dostęp do stron: skrypt treści na `<all_urls>`, także w ramkach (`all_frames`) | Pola tekstowe, w które użytkownik może wpisać dane osobowe, są na dowolnych stronach i często w ramkach (edytory, formularze osadzone). Skrypt czyta tylko pole, które użytkownik edytuje, pomija pola haseł, kart i kodów jednorazowych i nic nie wysyła poza rozszerzenie. Na stronach ustawionych jako „Wyłączone” nie analizuje pól.                                                                                                                                                     |

### Zdalny kod

Odpowiedź: **Nie, nie używam zdalnego kodu.**

```
Cały kod jest w paczce rozszerzenia: skrypty rozszerzenia, Pyodide (pyodide.mjs, pyodide.asm.mjs, pyodide.asm.wasm, python_stdlib.zip) i biblioteka polanon jako plik wheel. Dokument offscreen ładuje je z adresów chrome-extension:// tej paczki. Nic nie jest pobierane z sieci. Lista pakietów Pyodide jest pusta, a domyślny adres CDN Pyodide jest usuwany z pyodide.mjs przy budowaniu; build kończy się błędem, jeśli w paczce zostanie adres CDN. WebAssembly wymaga 'wasm-unsafe-eval' w CSP stron rozszerzenia; 'unsafe-eval' nie jest używane.
```

### Wykorzystanie danych (zakładka „Privacy practices”)

Rozszerzenie nie przesyła żadnych danych poza urządzenie. Formularz pyta jednak o dane, które
rozszerzenie „zbiera lub wykorzystuje”, a AInonim czyta tekst pól i przechowuje część danych
lokalnie, więc deklarujemy zachowawczo:

| Pole w formularzu                   | Zaznaczyć? | Dlaczego                                                                                                                             |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Personally identifiable information | tak        | tekst pól zawiera imiona, PESEL, e-mail, telefon, adres; pary znacznik → oryginał w `storage.session`; własne słowa mogą je zawierać |
| Health information                  | nie        | rozszerzenie nie wykrywa ani nie przechowuje danych o zdrowiu jako takich                                                            |
| Financial and payment information   | tak        | IBAN i numery kart płatniczych w tekście pól i w parach znacznik → oryginał                                                          |
| Authentication information          | tak        | wykrywa sekrety (np. klucze API) wpisane w pole; pola haseł są pomijane                                                              |
| Personal communications             | tak        | czyta treść wiadomości pisanych w polach i wiadomości w czatach AI                                                                   |
| Location                            | nie        | nie używa lokalizacji urządzenia (adresy w tekście są ujęte w PII)                                                                   |
| Web history                         | tak        | dziennik maskowania zapisuje nazwy hostów stron, na których maskowano, z czasem                                                      |
| User activity                       | nie        | nie rejestruje kliknięć, ruchów myszy ani naciśnięć klawiszy; czyta tylko zawartość edytowanego pola                                 |
| Website content                     | tak        | czyta tekst pól i odpowiedzi czatów, żeby przywrócić oryginały                                                                       |

„User activity” to decyzja graniczna: jeśli recenzent uzna czytanie pola w trakcie pisania za
aktywność użytkownika, zaznaczyć także to pole.

Trzy oświadczenia (zaznaczyć wszystkie):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Adres polityki prywatności: publiczna wersja `docs/privacy-policy.md`:
[[DO UZUPEŁNIENIA: publiczny adres URL polityki prywatności]].

### Zrzuty ekranu (1280×800) i wideo

Sklep przyjmuje najwyżej 5 zrzutów 1280×800. Pliki w `assets/store/`; te same ujęcia w 2560×1600
(do README i na stronę) są w `assets/store/hires/`. Oba rozmiary są renderowane natywnie, bez
skalowania obrazu. Generuje je z prawdziwym rozszerzeniem (build e2e) `npm run screenshots`
(`scripts/screenshots.js`, wspólna konfiguracja w `scripts/store-kit.js`, strona czatu w
`scripts/screenshot-pages/`). Strona czatu jest lokalna i neutralna: jest podstawiona pod adres
`chatgpt.com` tylko po to, żeby zadziałał adapter czatu, ale nie naśladuje wyglądu żadnego serwisu;
wszystkie inne żądania są blokowane. Odpowiedź „modelu” wstawia skrypt; ikona, panel, maskowanie,
przywracanie, ustawienia i popup są prawdziwe. Podpowiedź przy odpowiedzi to treść atrybutu
`title`, który ustawia rozszerzenie; skrypt ją rysuje, bo przeglądarka bez okna nie pokazuje
natywnych podpowiedzi. Popup to prawdziwa strona popupu; skrypt podaje jej tylko adres karty, bo
popup otwarty ze skryptu nie dostaje `activeTab`. Na zrzutach nie ma paska przeglądarki, innych
rozszerzeń, kont ani kursora tekstowego. Wszystkie dane są fikcyjne (Jan Kowalski, PESEL
50810112354, adresy w `example.pl`).

1. `screenshot-1-panel.png`: wiadomość w czacie z „Jan Kowalski”, PESEL i IBAN-em, zaznaczone
   wartości, ikona z liczbą 3 i otwarty panel z trzema wartościami, przełącznikami „znacznik |
   ogólnie” i przyciskiem „Zamaskuj zaznaczone (3)”.
   Podpis: „Widzisz dane osobowe, zanim je wyślesz”.
2. `screenshot-2-restored.png`: wysłana wiadomość i odpowiedź z przywróconymi, podświetlonymi
   oryginałami, podpowiedź „model napisał <IBAN_1>”, a w polu kolejna wiadomość z `<EMAIL_1>`.
   Podpis: „Model widzi znaczniki, Ty widzisz oryginały”.
3. `screenshot-3-popup.png`: popup nad czatem: tryb dla strony, tryb maskowania (ręcznie, przy
   wysyłce, przy pisaniu), wyświetlanie i „Zapamiętane dane” tej rozmowy z „Usuń” i „Usuń wszystko”.
   Podpis: „Wszystko pod ręką, zapamiętane dane usuniesz jednym kliknięciem”.
4. `screenshot-4-options.png`: ustawienia, zakładka „Ogólne”: trzy tryby maskowania i wyświetlanie
   odpowiedzi.
   Podpis: „Maskowanie ręczne albo automatyczne: przy wysyłce lub podczas pisania”.
5. `screenshot-5-categories.png`: zakładka „Kategorie”: które rodzaje danych wykrywać i na co je
   zamieniać (znacznik albo opis ogólny).
   Podpis: „Sam decydujesz, co i jak maskować”.

Wideo (1920×1080, H.264, ok. 56 s, bez dźwięku): `assets/store/demo.mp4`, generowane przez
`npm run video` (`scripts/demo-video.js`, potrzebny `ffmpeg`). Pokazuje wykrywanie podczas pisania,
panel, maskowanie jednym kliknięciem, odpowiedź modelu ze znacznikami i przywrócenie oryginałów (z
odmianą), a potem włączenie maskowania przy wysyłce i wysłanie wiadomości Enterem. Kursor, podpisy i
plansze są rysowane na stronie; klatki są nagrywane bezstratnie przy zoomie karty 200%, więc obraz
ma pełną ostrość 1080p. Sklep przyjmuje wideo jako link do YouTube: plik trzeba tam wgrać (może
być „niepubliczny”) i wkleić adres w panelu.

Mały kafelek promocyjny (440×280): `assets/store/promo-440x280.png`, generowany razem z ikonami
przez `node scripts/render-icons.js` z `assets/icon.svg`. Jego tekst („Maskuje polskie dane
osobowe, zanim trafią do czatu AI. Lokalnie, bez wysyłania.”) jest nadal aktualny.

### Do zrobienia przez właściciela (poza repozytorium)

- [ ] Konto dewelopera Chrome Web Store i jednorazowa opłata rejestracyjna.
- [ ] Deklaracja „trader / non-trader” (wymóg UE, DSA); jako trader podać dane kontaktowe, które
      będą publiczne.
- [ ] Kontaktowy e-mail wydawcy (zweryfikowany w panelu): [[DO UZUPEŁNIENIA: e-mail kontaktowy]].
- [ ] Nazwa wydawcy w polityce prywatności: [[DO UZUPEŁNIENIA: nazwa wydawcy (osoba lub firma) i adres]].
- [ ] Opublikowanie polityki prywatności pod stałym publicznym adresem i wpisanie go w panelu:
      [[DO UZUPEŁNIENIA: publiczny adres URL polityki prywatności]].
- [ ] Potwierdzenie daty wejścia w życie polityki (wpisano 22 listopada 2026 r.) albo jej zmiana
      na dzień publikacji.
- [ ] Licencja: `package.json` deklaruje MIT, ale w repozytorium nie ma pliku `LICENSE`;
      [[DO UZUPEŁNIENIA: licencja i plik LICENSE]].
- [ ] Strona domowa / wsparcia w panelu (opcjonalne): [[DO UZUPEŁNIENIA: adres strony]].
- [ ] Wgranie zipa z `npm run zip` (sprawdza paczkę skryptem `check-production-build.js`).

---

## English

### Name

AInonim

### Short description (120 characters, limit 132)

Only if an English listing is added; the manifest `description` is Polish.

```
Detects and masks Polish personal data (PESEL, NIP, IBAN, names) in AI chats and web forms. Runs locally, sends nothing.
```

### Detailed description

```
AInonim shows which Polish personal data is in a text field before you send it to an AI chat or a form, and replaces it with tokens, e.g. "Jan Kowalski" → <OSOBA_1>.

What it detects:
• PESEL, NIP, REGON, KRS, Polish ID card, passport and driving licence numbers, IBAN, payment card numbers (numbers verified by checksum),
• e-mail, phone, address, postal code, IP address, licence plate, VIN,
• first names and surnames in every grammatical case, company names, dates,
• secrets such as API keys,
• your own words and patterns, e.g. project names or client numbers.

How it works:
• An icon in the field's corner shows how much data was found. Clicking it opens a panel listing the values.
• In the panel you choose what to mask and, per value, a token or a general description (e.g. only the year instead of a full date). "Cofnij" (undo) brings back the text as it was.
• In AI chats you can turn on automatic masking when a message is sent.
• In chat answers and sent messages you see the originals again instead of the tokens; hovering shows what the model received. You can also keep the tokens on screen.
• Password, card and one-time-code fields are skipped.
• Per site you choose: warn or off. In the settings you can switch off categories you do not want detected.
• The masking log records only counts (when, on which site, how many values of which kind), never the data itself. It can be exported as CSV, printed as a report or switched off.

Supported chats: restoring originals and masking on send work in ChatGPT, Claude, Gemini, Grok, Perplexity, Kimi, DeepSeek, Mistral Le Chat, Microsoft Copilot and Qwen. Detection and manual masking work in text fields on any site. AInonim is not affiliated with OpenAI, Anthropic, Google, xAI, Perplexity, Moonshot AI, DeepSeek, Mistral AI, Microsoft or Alibaba.

Privacy:
• Detection runs entirely in the browser: the open-source polanon library run by Pyodide (WebAssembly), bundled in the extension package.
• The extension sends nothing to any server. No telemetry, no analytics, no accounts.
• Token → original pairs are kept in the browser's session memory and cleared when the browser closes; you can also delete them in the extension popup.

Limits:
• This is pseudonymisation, not anonymisation in the legal sense.
• No detector catches everything. Read your text before sending it.
• Files and images attached to messages are not checked.
```

### Category

Suggested: **Privacy & Security** (under "Make Chrome Yours"). Fallback: **Tools**.

### Single purpose

```
Protecting Polish personal data in text the user types in the browser: detecting it in the field being edited and replacing it with tokens before it is sent (with the originals shown again on the user's own screen in AI chats), entirely locally.
```

### Permission justifications

**offscreen**

```
Detection is done by the polanon library running in Pyodide (WebAssembly), which is bundled in the package. It runs in an offscreen document because the MV3 service worker is suspended when idle and would have to reload the interpreter on every wake-up, and content scripts cannot host it because they run in the web page's context. The offscreen document only accepts requests from the extension's own service worker.
```

**storage**

```
Three areas. storage.session: token → original pairs for AI chat conversations, needed to show the originals again in answers; memory only, cleared when the browser closes, readable only by the service worker. storage.sync: settings (per-site level, masking mode, answer display, switched-off categories, whether the log is on) and the user's own words to mask. storage.local: the masking log (time, hostname, counts per category, never the data itself), readable only by extension pages.
```

**activeTab**

```
When the user clicks the toolbar icon, the popup reads the current tab's URL to show the setting for that site and the data remembered for that conversation. The extension does not request the tabs permission and does not read browsing history.
```

**Host permissions / content script on all sites (`<all_urls>`, all frames)**

```
Text fields where users type personal data exist on any website and often inside frames (embedded editors and forms), not only in AI chats. The content script reads only the field the user is editing, skips password, payment card and one-time-code fields, and sends nothing outside the extension. On sites the user sets to "off" it does not analyse fields. On the supported AI chats (ChatGPT, Claude, Gemini and seven others) it also restores the originals in answers on the user's screen.
```

### Remote code

Answer: **No, I am not using remote code.**

```
All code ships in the package: the extension scripts, Pyodide (pyodide.mjs, pyodide.asm.mjs, pyodide.asm.wasm, python_stdlib.zip) and the polanon library as a wheel file. The offscreen document loads them from this package's chrome-extension:// URLs. Nothing is fetched from the network. The Pyodide package list is empty, and Pyodide's default CDN URL is removed from pyodide.mjs at build time; the build fails if any CDN URL remains in the package. WebAssembly needs 'wasm-unsafe-eval' in the extension pages' CSP; 'unsafe-eval' is not used.
```

### Data usage (Privacy practices tab)

Tick: Personally identifiable information, Financial and payment information, Authentication
information, Personal communications, Web history, Website content. Leave unticked: Health
information, Location, User activity (borderline; tick it if the reviewer asks). Reasons are in the
Polish table above. All data stays on the device.

Tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: [[DO UZUPEŁNIENIA: publiczny adres URL polityki prywatności]].

### Screenshot captions

1. "See personal data before you send it"
2. "The model sees tokens, you see the originals"
3. "Mask manually or automatically on send"
4. "Your own words and patterns are masked too"
5. "Masking log: counts only, no data"
6. "Delete remembered data in one click"
