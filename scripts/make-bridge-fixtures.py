"""Write the expected bridge output for every benchmark sample, computed under CPython.

tests/unit/bridge.test.ts runs the same bridge in Pyodide and asserts the output is identical.
The wheel from vendor/ is installed into a throwaway venv, so no Python environment is touched.

Usage (Python 3.11+; the Python that Pyodide bundles is the closest match):
    python3 scripts/make-bridge-fixtures.py
"""

import json
import subprocess
import sys
import tempfile
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures" / "benchmarks"


def write_fixtures() -> None:
    """Run inside the venv: analyze every sample and write expected/<name>.json."""
    sys.path.insert(0, str(ROOT / "python"))
    import ainonim_bridge

    expected = FIXTURES / "expected"
    expected.mkdir(exist_ok=True)
    for sample in sorted((FIXTURES / "samples").glob("*.txt")):
        text = sample.read_text(encoding="utf-8")
        result = json.loads(ainonim_bridge.analyze(text, "{}"))
        target = expected / f"{sample.stem}.json"
        target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{target.relative_to(ROOT)}: {len(result['spans'])} spans")


def main() -> None:
    wheels = sorted((ROOT / "vendor").glob("polanon-*.whl"))
    if len(wheels) != 1:
        sys.exit(f"expected exactly one polanon wheel in vendor/, found {len(wheels)}")
    with tempfile.TemporaryDirectory() as tmp:
        venv.create(tmp, with_pip=True)
        python = Path(tmp) / "bin" / "python"
        pip = [str(python), "-m", "pip", "install", "--quiet", "--no-deps", "--no-index"]
        subprocess.run([*pip, str(wheels[0])], check=True)
        subprocess.run([str(python), "-I", "-B", __file__, "--inside"], check=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["--inside"]:
        write_fixtures()
    else:
        main()
