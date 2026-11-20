# Bezpieczeństwo

AInonim ma nie dopuścić, żeby dane osobowe z pola tekstowego trafiły do czatu AI albo formularza
bez wiedzy użytkownika. Jeśli znajdziesz podatność w rozszerzeniu albo sposób, żeby dane osobowe
przeszły przez maskowanie, zgłoś to prywatnie.

## Jak zgłosić

- Napisz na **[e-mail kontaktowy]**.
- Nie zakładaj publicznego zgłoszenia (issue) ani dyskusji dla problemu, który nie jest jeszcze
  naprawiony: opisałoby publicznie, jak obejść ochronę, zanim użytkownicy dostaną poprawkę.
- Opisz, co się dzieje i jak to powtórzyć: wersja rozszerzenia i Chrome, strona (lub lokalny plik
  HTML), dokładny tekst albo kroki. Używaj **wyłącznie fikcyjnych danych** (np. Jan Kowalski, PESEL
  50810112354); nie przysyłaj prawdziwych danych osobowych.

Potwierdzimy otrzymanie zgłoszenia i ustalimy z Tobą termin publikacji poprawki oraz opisu.

## Zakres

Zgłoszenia dotyczące:

- kodu rozszerzenia z tego repozytorium: content script, service worker, dokument offscreen, popup,
  obsługa wiadomości między nimi, uprawnienia i CSP w manifeście,
- integracji z dołączonymi polanon i Pyodide (`python/ainonim_bridge.py`, ładowanie Pyodide i koła
  polanon z paczki),
- każdej drogi, którą tekst lub mapowanie „znacznik → oryginał” opuszcza urządzenie albo trafia do
  innej strony niż ta, na której powstało (np. inna witryna odczytuje mapowanie rozmowy),
- sytuacji, w której „Zamaskuj” zostawia w polu wykrytą wartość w postaci jawnej, albo przywracanie
  wstawia oryginał tam, gdzie nie powinno (np. do pola, które zostanie wysłane),
- kodu, który mógłby trafić do paczki produkcyjnej, a służy tylko testom.

## Poza zakresem

- **Braki w wykrywaniu**, czyli wartość, której polanon nie rozpoznaje jako danych osobowych
  (np. samo nazwisko, nietypowy zapis numeru). To sprawa biblioteki polanon: zgłoś je zgodnie z jej
  polityką bezpieczeństwa,
  [SECURITY.md w repozytorium polanon](https://github.com/boromat/polanon/blob/main/SECURITY.md).
  Jeśli dana wartość jest wykrywana w polanon, a w rozszerzeniu nie, to zgłoszenie jest tutaj.
- Złośliwe oprogramowanie na komputerze użytkownika, inne rozszerzenia z dostępem do stron, zmienione
  pliki przeglądarki albo profilu.
- Tekst, który użytkownik wysłał, nie klikając „Zamaskuj”, albo na stronie, dla której wybrał
  „Wyłączone”.

## Wspierane wersje

Poprawki bezpieczeństwa trafiają tylko do najnowszej wersji opublikowanej w Chrome Web Store.
Starszych wersji nie łatamy; zaktualizuj rozszerzenie.

---

## English

AInonim is meant to keep personal data typed into a text field from reaching an AI chat or a form
without the user knowing. If you find a vulnerability in the extension, or a way to get personal
data past the masking, please report it privately.

**How to report.** Write to **[e-mail kontaktowy]**. Do not open a public issue or discussion for a
problem that is not fixed yet. Include the extension and Chrome versions, the page (or a local HTML
file) and the exact text or steps. Use fictitious data only; never send real personal data.

**In scope:** the extension code in this repository (content script, service worker, offscreen
document, popup, messaging, manifest permissions and CSP) and its integration with the bundled
polanon and Pyodide; any path by which field text or the token → original mapping leaves the device
or reaches another site; masking that leaves a detected value in the clear; restoring an original
where it should not appear.

**Out of scope:** detection misses, i.e. values polanon does not recognise as personal data; report
those under
[polanon's SECURITY.md](https://github.com/boromat/polanon/blob/main/SECURITY.md) (if polanon
detects a value and the extension does not, report it here). Also out of scope: malware on the
user's machine, other extensions, and text sent without masking or on a site switched off.

**Supported versions:** only the latest version published in the Chrome Web Store.
