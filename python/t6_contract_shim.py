"""TEMPORARY (T6): adapts the T2 bridge to the T5 contract until T5 lands.

Runs in the bridge's namespace after ainonim_bridge.py. Once the bridge itself provides
`analyze(text, mapping_json)` and `restore(text, mapping_json)` this file does nothing; delete it
(and its two lines in entrypoints/offscreen/main.ts) after merging T5.
"""

import inspect as _inspect
import json as _json

if len(_inspect.signature(analyze).parameters) == 1:  # noqa: F821 (defined by the bridge)
    _analyze_text_only = analyze  # noqa: F821

    def analyze(text: str, mapping_json: str) -> str:
        return _analyze_text_only(text)


if "restore" not in globals():

    def restore(text: str, mapping_json: str) -> str:
        mapping = _json.loads(mapping_json)
        for token in sorted(mapping, key=len, reverse=True):
            text = text.replace(token, mapping[token])
        return text
