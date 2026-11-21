"""Bridge between the extension (JavaScript) and polanon, run inside Pyodide.

Rules only, no spaCy: NER needs native wheels that do not exist for Pyodide.
"""

import json
import re
from bisect import bisect_left

from polanon import CASED_TOKEN_PATTERN, Anonymizer, default_guards

_anonymizer = Anonymizer(default_guards(with_ner=False))

# polanon's own token format, with the optional grammatical case: `<OSOBA_1:dopełniacz>`.
_TOKEN = re.compile(CASED_TOKEN_PATTERN)


def _load_mapping(mapping_json: str) -> dict[str, str]:
    mapping = json.loads(mapping_json)
    if not isinstance(mapping, dict) or not all(
        isinstance(key, str) and isinstance(value, str) for key, value in mapping.items()
    ):
        raise ValueError("mapping_json must be a JSON object of token -> original string")
    return mapping


def _to_utf16(text: str):
    """Return a function that turns a code-point index into `text` into a UTF-16 index.

    A character outside the BMP is one code point in Python and two code units in JavaScript.
    """
    astral = [index for index, char in enumerate(text) if ord(char) > 0xFFFF]
    return lambda index: index + bisect_left(astral, index)


def _tokens(anonymized: str, spans) -> list[str]:
    """Return the token that replaced each span (sorted by start) in `anonymized`.

    Walks the spans in order, tracking how far each earlier replacement moved the text.
    """
    tokens = []
    shift = 0
    for span in spans:
        match = _TOKEN.match(anonymized, span.start + shift)
        if match is None:
            raise ValueError("a span has no token at its place in the anonymized text")
        tokens.append(match.group(0))
        shift += len(match.group(0)) - (span.end - span.start)
    return tokens


def analyze(text: str, mapping_json: str) -> str:
    """Mask `text`, keeping the tokens `mapping_json` already gave out, and return JSON.

    Span offsets are UTF-16 code units, the indices of the same string in JavaScript. Each span
    carries the token that stands in its place in `anonymized`.
    """
    result = _anonymizer.anonymize_sync(text, _load_mapping(mapping_json))
    spans = sorted(result.spans, key=lambda span: span.start)
    tokens = _tokens(result.anonymized, spans)
    utf16 = _to_utf16(text)
    return json.dumps(
        {
            "anonymized": result.anonymized,
            "spans": [
                {
                    "start": utf16(span.start),
                    "end": utf16(span.end),
                    "entity_type": span.entity_type,
                    "score": span.score,
                    "token": token,
                }
                for span, token in zip(spans, tokens, strict=True)
            ],
            "mapping": result.mapping,
        },
        ensure_ascii=False,
    )


def restore(text: str, mapping_json: str) -> str:
    """Put the originals back in place of the tokens, declining `<OSOBA_1:wołacz>` and the like."""
    return Anonymizer.restore(text, _load_mapping(mapping_json))
