# Polityka prywatności AInonim / AInonim Privacy Policy

Obowiązuje od: 22 listopada 2026 r. · Effective date: 22 November 2026

Wydawca rozszerzenia / Publisher: [[DO UZUPEŁNIENIA: nazwa wydawcy (osoba lub firma) i adres]]
Kontakt / Contact: [[DO UZUPEŁNIENIA: e-mail kontaktowy]]

English version below.

---

## Polski

### W skrócie

- AInonim działa wyłącznie w Twojej przeglądarce. Nie wysyła żadnych danych na żaden serwer, ani
  wydawcy, ani nikomu innemu.
- Nie ma analityki, telemetrii, reklam ani kont użytkowników.
- Zapisuje tylko to, czego potrzebuje do działania: zapamiętane dane rozmów (do zamknięcia
  przeglądarki), Twoje ustawienia i własne słowa oraz dziennik maskowania (same liczby, bez
  danych). Każdą z tych rzeczy możesz usunąć sam.

### Co robi AInonim

AInonim to rozszerzenie przeglądarki Chrome. Wykrywa polskie dane osobowe w polu tekstowym, które
edytujesz na dowolnej stronie, i na Twoje polecenie zastępuje je znacznikami (np. `<OSOBA_1>`)
albo ogólnym opisem. W obsługiwanych czatach AI pokazuje Ci z powrotem oryginały w miejscu
znaczników w odpowiedziach i wysłanych wiadomościach.

### Jakie dane rozszerzenie czyta

- **Tekst pola, które edytujesz** (`input`, `textarea`, edytory typu contenteditable) na stronie,
  na której AInonim jest włączony. Może zawierać wszystko, co wpiszesz lub wkleisz, w tym dane
  osobowe: imiona i nazwiska, PESEL, NIP, REGON, numery dokumentów, IBAN, numery kart płatniczych,
  e-mail, telefon, adres, daty, sekrety (np. klucze API).
- **Wiadomości i odpowiedzi w obsługiwanych czatach AI**: rozszerzenie szuka w nich znaczników,
  żeby pokazać w ich miejscu oryginały.
- **Adres bieżącej karty**, gdy otworzysz okienko rozszerzenia (żeby pokazać ustawienie dla tej
  strony i dane zapamiętane w tej rozmowie).

Rozszerzenie nie czyta pól haseł, pól oznaczonych jako dane karty płatniczej (`autocomplete="cc-…"`)
ani kodów jednorazowych, a także pól ukrytych, wyłączonych i tylko do odczytu. Nie sprawdza plików
ani obrazów dołączanych do wiadomości.

Na stronie, dla której wybierzesz „Wyłączone”, rozszerzenie nie analizuje pól.

### Gdzie dane są przetwarzane

Wyłącznie lokalnie, na Twoim komputerze. Tekst pola trafia od skryptu na stronie do procesu
rozszerzenia, a wykrywanie wykonuje otwarta biblioteka polanon uruchomiona przez Pyodide
(WebAssembly) w dokumencie offscreen rozszerzenia. Pyodide, polanon i cały pozostały kod są w
paczce rozszerzenia; w trakcie działania nic nie jest pobierane z sieci.

### Co jest przechowywane, gdzie i jak długo

| Dane                                                                                                                                                                            | Gdzie                                                               | Jak długo                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Zapamiętane dane rozmów**: pary znacznik → oryginał (np. `<OSOBA_1>` → „Jan Kowalski”) dla rozmów w obsługiwanych czatach AI. To dane osobowe.                                | `chrome.storage.session`: w pamięci przeglądarki, nie na dysku      | do zamknięcia przeglądarki; najwyżej 50 ostatnio używanych rozmów, starsze są usuwane automatycznie                                  |
| **Ustawienia**: poziom dla stron (nazwa hosta i „Wyłączone”), sposób wyświetlania odpowiedzi, tryb maskowania, wyłączone kategorie, włączenie dziennika                         | `chrome.storage.sync`                                               | do zmiany ustawienia lub odinstalowania rozszerzenia                                                                                 |
| **Własne słowa**: słowa, frazy i wyrażenia regularne, które sam dodasz do maskowania. Mogą zawierać dane osobowe, jeśli je tam wpiszesz (np. nazwisko klienta).                 | `chrome.storage.sync`                                               | do usunięcia słowa lub odinstalowania rozszerzenia                                                                                   |
| **Dziennik maskowania**: dla każdego maskowania czas, nazwa hosta strony (np. `chatgpt.com`), czy ręcznie czy automatycznie oraz liczba zamaskowanych wartości każdego rodzaju. | `chrome.storage.local`: na dysku tego komputera, bez synchronizacji | do wyczyszczenia dziennika lub odinstalowania; przechowywanych jest najwyżej 1000 ostatnich wpisów, starsze są usuwane automatycznie |

Dziennik nigdy nie zawiera samych danych, znaczników ani treści pól. Ustawienia poza własnymi
słowami nie zawierają treści pól.

Na stronach innych niż obsługiwane czaty AI pary znacznik → oryginał nie są zapisywane: istnieją
tylko w pamięci otwartej karty (dla przycisku „Cofnij”) i znikają po jej zamknięciu lub
przeładowaniu.

**Synchronizacja Chrome.** Jeśli masz włączoną synchronizację Chrome, przeglądarka synchronizuje
`chrome.storage.sync` (ustawienia i własne słowa) z Twoim kontem Google i innymi urządzeniami, na
których jesteś zalogowany. Robi to Chrome na zasadach Google, nie AInonim; rozszerzenie nie ma
dostępu do Twojego konta. Jeśli nie chcesz, żeby własne słowa były synchronizowane, nie wpisuj do
nich danych osobowych albo wyłącz synchronizację rozszerzeń w ustawieniach Chrome.

**Pliki, które sam zapisujesz.** Eksport własnych słów (JSON), eksport dziennika (CSV) i raport do
wydruku tworzy rozszerzenie lokalnie; trafiają tam, gdzie je zapiszesz lub wydrukujesz.

### Jak usunąć dane

- **Zapamiętane dane rozmów**: w okienku rozszerzenia, sekcja „Zapamiętane dane”: usuń jedną
  rozmowę albo kliknij „Usuń wszystko”. Znikają też same po zamknięciu przeglądarki.
- **Dziennik maskowania**: ustawienia → zakładka „Dziennik” → „Wyczyść dziennik”. Zapisywanie
  dziennika wyłączysz w zakładce „Ogólne”.
- **Własne słowa**: ustawienia → zakładka „Własne słowa”: usuń wybrane słowa.
- **Ustawienia**: przywróć domyślne wartości w okienku lub w ustawieniach.
- **Wszystko naraz**: odinstaluj rozszerzenie. Chrome usuwa wtedy wszystkie jego dane z tego
  urządzenia.

### Czego rozszerzenie nie robi

- Nie wysyła żadnych danych na żaden serwer: ani treści pól, ani zapamiętanych danych, ani
  dziennika, ani statystyk.
- Nie używa analityki, telemetrii, reklam, plików cookie ani identyfikatorów użytkownika.
- Nie sprzedaje danych i nie przekazuje ich nikomu. Wydawca nie ma do nich dostępu.
- Nie używa danych do celów innych niż opisane wyżej, w szczególności nie do reklam ani oceny
  zdolności kredytowej.

To, co sam wyślesz na stronę (np. wiadomość w czacie AI), trafia do operatora tej strony na jego
zasadach. AInonim pomaga ograniczyć dane osobowe w tej wiadomości, ale nie kontroluje strony.

### Zasady Chrome Web Store

AInonim nie korzysta z interfejsów API Google do pobierania danych z Twojego konta Google. Sposób
wykorzystania informacji, które rozszerzenie przetwarza, jest zgodny z Zasadami dotyczącymi danych
użytkownika w Chrome Web Store (Chrome Web Store User Data Policy), w tym z wymaganiami
ograniczonego użytkowania (Limited Use).

### Obsługiwane czaty AI

Przywracanie oryginałów, zapamiętywanie danych rozmów i automatyczne maskowanie przy wysyłce
działają w: ChatGPT (`chatgpt.com`, `chat.openai.com`), Claude.ai (`claude.ai`), Gemini
(`gemini.google.com`), Grok (`grok.com`) i Perplexity (`perplexity.ai`). Na pozostałych stronach
działa wykrywanie i ręczne maskowanie w polach tekstowych. AInonim nie jest powiązany z OpenAI,
Anthropic, Google, xAI ani Perplexity.

### Ograniczenia

- To **pseudonimizacja**, nie anonimizacja w rozumieniu prawa. Rozszerzenie samo w sobie nie
  zapewnia zgodności z RODO.
- Żaden detektor nie wykrywa wszystkiego. Przed wysłaniem przeczytaj tekst.
- Zapamiętane dane rozmów są tak samo wrażliwe jak oryginalne dane. Oryginały przywrócone w
  odpowiedziach nie są nigdzie wysyłane przez rozszerzenie, ale są wyświetlane w samej stronie,
  więc jej skrypty mogą je odczytać, tak jak wszystko inne, co widzisz na tej stronie.

Szczegóły: [model zagrożeń](THREAT_MODEL.md).

### Dzieci

AInonim nie jest skierowany do dzieci. Ponieważ rozszerzenie nie zbiera danych i niczego nie
wysyła, nie gromadzi też danych dzieci.

### Zmiany polityki

Zmiany publikujemy w tym miejscu, z nową datą obowiązywania. Jeśli zmieni się sposób
przetwarzania danych, opiszemy to także w informacjach o wydaniu rozszerzenia.

### Kontakt

Pytania o prywatność: [[DO UZUPEŁNIENIA: e-mail kontaktowy]].

---

## English

### Summary

- AInonim works only in your browser. It sends no data to any server, neither to the publisher nor
  to anyone else.
- There is no analytics, telemetry, advertising or user account.
- It stores only what it needs to work: remembered conversation data (until the browser closes),
  your settings and own words, and a masking log (counts only, no data). You can delete each of
  them yourself.

### What AInonim does

AInonim is a Chrome extension. It detects Polish personal data in the text field you are editing
on any site and, when you tell it to, replaces it with tokens (e.g. `<OSOBA_1>`) or a general
description. In supported AI chats it shows you the originals again in place of the tokens in
answers and sent messages.

### What data the extension reads

- **The text of the field you are editing** (`input`, `textarea`, contenteditable editors) on a
  site where AInonim is on. It may contain anything you type or paste, including personal data:
  names, PESEL, NIP, REGON, document numbers, IBAN, payment card numbers, e-mail, phone, address,
  dates, secrets (e.g. API keys).
- **Messages and answers in supported AI chats**: the extension looks for tokens in them to show
  the originals in their place.
- **The URL of the current tab** when you open the extension's popup (to show the setting for that
  site and the data remembered for that conversation).

The extension does not read password fields, fields marked as payment card data
(`autocomplete="cc-…"`) or one-time codes, nor hidden, disabled or read-only fields. It does not
check files or images attached to messages.

On a site you set to "Wyłączone" (off), the extension does not analyse fields.

### Where data is processed

Only locally, on your computer. The field text goes from the script on the page to the extension's
own process, and detection is done by the open-source polanon library run by Pyodide (WebAssembly)
in the extension's offscreen document. Pyodide, polanon and all other code ship inside the
extension package; nothing is downloaded from the network at runtime.

### What is stored, where and for how long

| Data                                                                                                                                                         | Where                                                       | How long                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Remembered conversation data**: token → original pairs (e.g. `<OSOBA_1>` → "Jan Kowalski") for conversations in supported AI chats. This is personal data. | `chrome.storage.session`: in browser memory, not on disk    | until the browser closes; at most the 50 most recently used conversations, older ones are removed automatically      |
| **Settings**: per-site level (hostname and "off"), answer display, masking mode, switched-off categories, whether the log is on                              | `chrome.storage.sync`                                       | until you change the setting or uninstall the extension                                                              |
| **Own words**: words, phrases and regular expressions you add for masking. They may contain personal data if you enter it there (e.g. a client's surname).   | `chrome.storage.sync`                                       | until you remove the word or uninstall the extension                                                                 |
| **Masking log**: for each masking the time, the site's hostname (e.g. `chatgpt.com`), manual or automatic, and the number of masked values of each kind.     | `chrome.storage.local`: on this computer's disk, not synced | until you clear the log or uninstall; at most the latest 1000 entries are kept, older ones are removed automatically |

The log never contains the data itself, tokens or field text. Settings other than own words
contain no field text.

On sites other than the supported AI chats, token → original pairs are not stored: they exist only
in the open tab's memory (for the "Cofnij" (undo) button) and are gone when the tab is closed or
reloaded.

**Chrome sync.** If Chrome sync is on, the browser syncs `chrome.storage.sync` (settings and own
words) with your Google account and the other devices you are signed in on. Chrome does this under
Google's terms, not AInonim; the extension has no access to your account. If you do not want your
own words synced, do not put personal data in them, or turn off extension sync in Chrome's
settings.

**Files you save yourself.** The own-words export (JSON), the log export (CSV) and the printable
report are created locally by the extension; they go wherever you save or print them.

### How to delete data

- **Remembered conversation data**: in the extension popup, section "Zapamiętane dane": delete one
  conversation or click "Usuń wszystko" (delete all). They are also cleared when the browser
  closes.
- **Masking log**: settings → "Dziennik" tab → "Wyczyść dziennik" (clear log). Logging can be
  switched off in the "Ogólne" tab.
- **Own words**: settings → "Własne słowa" tab: remove the words.
- **Settings**: set them back to their defaults in the popup or the settings.
- **Everything at once**: uninstall the extension. Chrome then deletes all of its data from this
  device.

### What the extension does not do

- It sends no data to any server: no field text, no remembered data, no log, no statistics.
- It uses no analytics, telemetry, advertising, cookies or user identifiers.
- It does not sell data or transfer it to anyone. The publisher has no access to it.
- It does not use data for any purpose other than the ones described above, in particular not for
  advertising or to determine creditworthiness.

What you yourself send to a site (e.g. a message in an AI chat) goes to that site's operator under
its terms. AInonim helps you reduce the personal data in that message but does not control the
site.

### Chrome Web Store policy

AInonim does not use Google APIs to obtain data from your Google account. The use of information
processed by the extension adheres to the Chrome Web Store User Data Policy, including the Limited
Use requirements.

### Supported AI chats

Restoring originals, remembering conversation data and automatic masking on send work on: ChatGPT
(`chatgpt.com`, `chat.openai.com`), Claude.ai (`claude.ai`), Gemini (`gemini.google.com`), Grok
(`grok.com`) and Perplexity (`perplexity.ai`). On other sites, detection and manual masking in text
fields work. AInonim is not affiliated with OpenAI, Anthropic, Google, xAI or Perplexity.

### Limits

- This is **pseudonymisation**, not anonymisation in the legal sense. The extension does not by
  itself make any processing GDPR-compliant.
- No detector catches everything. Read your text before sending it.
- Remembered conversation data is as sensitive as the original data. Originals restored in answers
  are never sent anywhere by the extension, but they are displayed inside the page itself, so the
  page's scripts can read them, like anything else you see on that page.

Details (in Polish): [threat model](THREAT_MODEL.md).

### Children

AInonim is not directed at children. Since the extension collects no data and sends nothing, it
does not collect children's data either.

### Changes to this policy

Changes are published here with a new effective date. If the way data is handled changes, the
release notes of the extension will say so too.

### Contact

Privacy questions: [[DO UZUPEŁNIENIA: e-mail kontaktowy]].
