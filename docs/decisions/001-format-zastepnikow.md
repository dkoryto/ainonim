# 001: Format zastępników

Data: 2026-11-19 · Status: przyjęta

## Decyzja

Wtyczka używa domyślnego formatu polanon: `<OSOBA_1>`, `<PESEL_1>`, z przypadkiem `<OSOBA_1:wołacz>`.
Opcja formatu w polanon (zadanie T4) nie jest potrzebna do MVP.

## Test (T3)

Jedna wiadomość z fikcyjnymi danymi, wysłana w ChatGPT i Claude.ai (19.11.2026):

> Napisz krótki e-mail (3 zdania) do klienta w sprawie korekty faktury. Klient: <OSOBA_1>, PESEL <PESEL_1>.
> Osoba kontaktowa: [OSOBA_2], numer konta [IBAN_1]. W powitaniu zwróć się do [OSOBA_2:wołacz].

|                                                                         | ChatGPT | Claude.ai |
| ----------------------------------------------------------------------- | ------- | --------- |
| `<…>` widoczne w wiadomości i odpowiedzi                                | tak     | tak       |
| `[…]` widoczne w wiadomości i odpowiedzi                                | tak     | tak       |
| Model zachował wszystkie zastępniki dosłownie, także `[OSOBA_2:wołacz]` | tak     | tak       |

## Uwagi do kolejnych zadań

- ChatGPT oddał e-mail w osobnym bloku edytora („E-mail”), nie w zwykłym tekście odpowiedzi: przywracanie (T13) musi obsłużyć też taki blok.
- W ChatGPT nie ma już elementu `#prompt-textarea`; edytor to `div.ProseMirror[contenteditable]`. W Claude.ai: `div.tiptap.ProseMirror`.
- `document.execCommand('insertText')` po `selectAll` podmienia treść edytora Claude.ai i edytor ją przyjmuje (podejście z T9).
- Gdyby któraś strona zaczęła gubić nawiasy ostre, gotowy jest projekt opcjonalnego formatu `[OSOBA_1]` w polanon
  (`TokenFormat`, ok. 13 plików, domyślne zachowanie bez zmian).
