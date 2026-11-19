"""Bridge between the extension (JavaScript) and polanon, run inside Pyodide.

Rules only, no spaCy: NER needs native wheels that do not exist for Pyodide.
"""

import json

from polanon import Anonymizer, default_guards

_anonymizer = Anonymizer(default_guards(with_ner=False))


def analyze(text: str) -> str:
    """Mask `text` and return the result as a JSON string.

    Span offsets are Python string indices (code points), not JavaScript UTF-16 indices.
    """
    result = _anonymizer.anonymize_sync(text)
    return json.dumps(
        {
            "anonymized": result.anonymized,
            "spans": [
                {
                    "start": span.start,
                    "end": span.end,
                    "entity_type": span.entity_type,
                    "score": span.score,
                }
                for span in result.spans
            ],
            "mapping": result.mapping,
        },
        ensure_ascii=False,
    )
