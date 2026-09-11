"""
Dump the API's OpenAPI schema to ``apps/binx-api/openapi.json``.

The web app generates its request/response types from this file
(``pnpm --filter binx-web gen:api``), so it's committed and CI checks it's
up to date. Run it after any change to a router or a Pydantic schema:

    uv run binx-api-openapi
"""

from __future__ import annotations

import json
from pathlib import Path

from binx_api.main import create_app

# Repo-relative: this file is src/binx_api/scripts/openapi.py, so the API root
# is three parents up.
_OUT = Path(__file__).resolve().parents[3] / "openapi.json"


def main() -> None:
    spec = create_app().openapi()
    _OUT.write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {_OUT} ({len(spec['paths'])} paths, {len(spec['components']['schemas'])} schemas)")


if __name__ == "__main__":
    main()
