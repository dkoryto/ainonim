"""Bridge between the extension (JavaScript) and polanon, run inside Pyodide.

Rules only, no spaCy: NER needs native wheels that do not exist for Pyodide.
"""

import json
from bisect import bisect_left

from polanon import Anonymizer, default_guards

_anonymizer = Anonymizer(default_guards(with_ner=False))


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


def analyze(text: str, mapping_json: str) -> str:
    """Mask `text`, keeping the tokens `mapping_json` already gave out, and return JSON.

    Span offsets are UTF-16 code units, the indices of the same string in JavaScript.
    """
    result = _anonymizer.anonymize_sync(text, _load_mapping(mapping_json))
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
                }
                for span in result.spans
            ],
            "mapping": result.mapping,
        },
        ensure_ascii=False,
    )


def restore(text: str, mapping_json: str) -> str:
    """Put the originals back in place of the tokens, declining `<OSOBA_1:wołacz>` and the like."""
    return Anonymizer.restore(text, _load_mapping(mapping_json))
