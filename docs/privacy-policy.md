# Polityka prywatności AInonim / AInonim Privacy Policy

Obowiązuje od: [data wejścia w życie] · Effective date: [effective date]

---

## Polski

### Co robi AInonim

AInonim to rozszerzenie przeglądarki Chrome. Sprawdza tekst w polu, które właśnie edytujesz
(`input`, `textarea`, edytory typu contenteditable), i pokazuje, ile i jakich polskich danych
osobowych w nim znalazło. Jednym kliknięciem możesz zastąpić je znacznikami, np. `<OSOBA_1>`.

### Jakie dane są przetwarzane

- **Tekst edytowanego pola.** Może zawierać dowolne dane, które wpiszesz lub wkleisz, w tym:
  PESEL, NIP, REGON, numer dowodu osobistego, IBAN, numer karty płatniczej, e-mail, telefon, kod
  pocztowy, imiona i nazwiska, nazwy firm, sekrety (np. klucze API).
- **Mapowanie znacznik → oryginał** (np. `<OSOBA_1>` → „Jan Kowalski”), tworzone po kliknięciu
  „zamaskuj”.
- **Ustawienia dla stron**: nazwa hosta (np. `chatgpt.com`) i wybrany tryb (ostrzegaj / wyłączone).

Pola haseł, numerów kart i kodów jednorazowych są pomijane: rozszerzenie ich nie czyta.

### Gdzie dane są przetwarzane

Wyłącznie na Twoim komputerze, w przeglądarce. Wykrywanie wykonuje otwarta biblioteka polanon
(licencja MIT), uruchomiona przez Pyodide (WebAssembly) w dokumencie offscreen rozszerzenia.
Pyodide i polanon są w paczce rozszerzenia; nic nie jest pobierane z sieci w trakcie działania.

### Co jest przechowywane i jak długo

| Dane                          | Gdzie                    | Jak długo                                                                                                                       |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Mapowanie znacznik → oryginał | `chrome.storage.session` | w pamięci, do zamknięcia przeglądarki                                                                                           |
| Ustawienia dla stron          | `chrome.storage.sync`    | do zmiany ustawień lub odinstalowania; jeśli masz włączoną synchronizację Chrome, Chrome synchronizuje je z Twoim kontem Google |

Ustawienia zawierają tylko nazwy hostów i tryb, bez treści pól.

### Czego rozszerzenie nigdy nie wysyła

Rozszerzenie nie wysyła żadnych danych na żaden serwer: ani treści pól, ani mapowań, ani
statystyk. Nie ma telemetrii, analityki ani kont użytkowników. Nie sprzedajemy i nie przekazujemy
danych nikomu.

To, co sam wyślesz na stronę (np. wiadomość w czacie AI), trafia do operatora tej strony na jego
zasadach. AInonim pomaga ograniczyć dane w tej wiadomości, ale nie kontroluje strony.

### Uprawnienia i po co są

| Uprawnienie                                          | Po co                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `offscreen`                                          | uruchomienie Pyodide i polanon w dokumencie offscreen, lokalnie                    |
| `storage`                                            | mapowania w `chrome.storage.session`, ustawienia stron w `chrome.storage.sync`     |
| `activeTab`                                          | działanie na bieżącej karcie po kliknięciu ikony rozszerzenia                      |
| skrypty treści na wszystkich stronach (`<all_urls>`) | pola tekstowe mogą być na każdej stronie; skrypt czyta tylko pole, które edytujesz |

### Ograniczenia

- To **pseudonimizacja**, nie anonimizacja w rozumieniu prawa. Rozszerzenie nie zapewnia samo w
  sobie zgodności z RODO.
- Żaden detektor nie wykrywa wszystkiego. Bez modelu językowego często umyka np. samo nazwisko lub
  nazwa miejscowości. Przed wysłaniem przeczytaj tekst.
- Mapowanie znacznik → oryginał jest tak samo wrażliwe jak oryginalne dane. Przywrócone oryginały
  w odpowiedziach ChatGPT i Claude.ai są widoczne tylko na Twoim ekranie.

### Kontakt i zmiany

Pytania: [e-mail kontaktowy]. O zmianach tej polityki informujemy, aktualizując ją w tym miejscu
i zmieniając datę obowiązywania.

---

## English

### What AInonim does

AInonim is a Chrome extension. It checks the text of the field you are editing (`input`,
`textarea`, contenteditable editors) and shows how many and which kinds of Polish personal data it
found. One click replaces them with tokens such as `<OSOBA_1>`.

### What data is processed

- **The text of the field you are editing.** It may contain anything you type or paste, including
  PESEL, NIP, REGON, ID card number, IBAN, payment card number, e-mail, phone, postal code, first
  names and surnames, company names, secrets (e.g. API keys).
- **The token → original mapping** (e.g. `<OSOBA_1>` → "Jan Kowalski"), created when you click
  "mask".
- **Per-site settings**: the hostname (e.g. `chatgpt.com`) and the chosen mode (warn / off).

Password, card-number and one-time-code fields are skipped: the extension does not read them.

### Where data is processed

Only on your computer, in the browser. Detection is done by the open-source polanon library (MIT
licence), run by Pyodide (WebAssembly) in the extension's offscreen document. Pyodide and polanon
ship inside the extension package; nothing is downloaded at runtime.

### What is stored and for how long

| Data                     | Where                    | How long                                                                                             |
| ------------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Token → original mapping | `chrome.storage.session` | in memory, until the browser closes                                                                  |
| Per-site settings        | `chrome.storage.sync`    | until you change them or uninstall; if Chrome sync is on, Chrome syncs them with your Google account |

Settings contain only hostnames and the mode, never field text.

### What the extension never sends

The extension sends no data to any server: no field text, no mappings, no statistics. There is no
telemetry, no analytics and no user account. We do not sell or transfer data to anyone.

What you yourself submit to a site (e.g. a message in an AI chat) goes to that site's operator under
its terms. AInonim helps you reduce personal data in that message but does not control the site.

### Permissions and why

| Permission                                  | Why                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `offscreen`                                 | to run Pyodide and polanon locally in an offscreen document                      |
| `storage`                                   | mappings in `chrome.storage.session`, per-site settings in `chrome.storage.sync` |
| `activeTab`                                 | to act on the current tab when you click the extension icon                      |
| content scripts on all sites (`<all_urls>`) | text fields can be on any page; the script reads only the field you are editing  |

### Limits

- This is **pseudonymisation**, not anonymisation in the legal sense. The extension does not by
  itself make any processing GDPR-compliant.
- No detector catches everything. Without a language model, e.g. a surname on its own or a city name
  is often missed. Read your text before sending it.
- The token → original mapping is as sensitive as the original data. Originals restored in ChatGPT
  and Claude.ai answers are shown on your screen only.

### Contact and changes

Questions: [e-mail kontaktowy]. Changes to this policy are published here with a new effective
date.
