# Benchmark fixtures

`samples/*.txt` and `gold/*.json` are copied unchanged from
[polanon](https://github.com/boromat/polanon) `benchmarks/samples` and `benchmarks/gold` at commit
`d29b91e` (polanon 0.4.1); they are the same at `bda00fc` (polanon 0.4.4). MIT License, Copyright (c) 2026 BoroMat. Every name and identifier in
them is fictional.

`expected/*.json` is the output of `python/ainonim_bridge.py` `analyze(text, "{}")` under CPython
with the wheel from `vendor/`, written by `scripts/make-bridge-fixtures.py`. Regenerate it after
changing the bridge or the wheel. `tests/unit/bridge.test.ts` checks that Pyodide gives the same.
