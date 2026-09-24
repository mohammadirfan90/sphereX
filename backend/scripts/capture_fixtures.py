"""Capture live-service responses into the recorded-real fixtures.

Phase 12 manual capture script. Run this script ONLY when the IRSA / Gaia /
JPL / CDS schemas have changed and the existing fixtures need to be re-recorded
against the live service. NEVER commit the results without first re-running
the full test suite to confirm nothing else broke.

Usage
-----
    cd backend
    SPHEREX_ODYSSEY_OFFLINE=0 python scripts/capture_fixtures.py \\
        --fixture irsa_sia__qr3_galactic_center_3products

The script will:
  1. Read the fixture entry from tests/fixtures/MANIFEST.json.
  2. Issue the real HTTP request described by ``url_pattern``.
  3. Write the response body to ``tests/fixtures/<source>/<id>.<ext>``.
  4. Recompute the SHA-256 and update MANIFEST.json.

The script refuses to overwrite an existing fixture unless --force is given,
because a re-recorded fixture must be a deliberate act.

Phase 12 invariant: this script never makes a real HTTP request unless
SPHEREX_ODYSSEY_OFFLINE is set to 0. By default it stays in dry-run mode and
just reports what it *would* do.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

import httpx

# Make the project root importable so we can reuse the fixture manifest.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tests._fixtures import (  # noqa: E402  - sys.path above
    _FIXTURES_ROOT,
    _load_manifest,
    list_fixtures,
)


def _resolve_url_pattern(entry: Dict[str, Any]) -> str:
    """Reconstruct the URL from the manifest entry's url_pattern.

    For Phase 12 we ship fixtures with hand-curated URL patterns that match the
    documented query (RA, Dec, release, etc.). If a future release changes the
    pattern, update MANIFEST.json in the same commit.
    """
    return entry["url_pattern"]


async def _capture_one(
    entry: Dict[str, Any],
    *,
    force: bool,
    dry_run: bool,
    timeout: float = 30.0,
) -> Optional[Dict[str, Any]]:
    """Capture one fixture and return its metadata, or None if skipped."""
    fx_id = entry["id"]
    body_path = _FIXTURES_ROOT / entry["body"]

    if body_path.exists() and not force:
        print(f"[skip] {fx_id}: body already present at {body_path} (use --force to overwrite)")
        return None

    url = _resolve_url_pattern(entry)
    print(f"[capture] {fx_id}: GET {url}")
    if dry_run:
        print(f"[dry-run] would have written to {body_path}")
        return None

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.get(url)

    body_path.parent.mkdir(parents=True, exist_ok=True)
    body_path.write_bytes(resp.content)
    body_sha = hashlib.sha256(resp.content).hexdigest()
    print(f"[capture] wrote {len(resp.content)} bytes to {body_path} (sha256={body_sha[:16]}…)")
    return {
        "id": fx_id,
        "status_code": resp.status_code,
        "body_sha256": body_sha,
        "content_type": resp.headers.get("content-type", "unknown"),
    }


async def _capture_all(fixture_ids: list[str], force: bool, dry_run: bool) -> int:
    manifest = _load_manifest()
    fixtures_by_id = {e["id"]: e for e in manifest.get("fixtures", [])}

    captured = []
    for fid in fixture_ids:
        entry = fixtures_by_id.get(fid)
        if entry is None:
            print(f"[error] fixture {fid!r} not in MANIFEST.json")
            return 2
        result = await _capture_one(entry, force=force, dry_run=dry_run)
        if result is not None:
            captured.append(result)

    if captured and not dry_run:
        # Update MANIFEST.json with the new SHAs.
        for result in captured:
            for entry in manifest["fixtures"]:
                if entry["id"] == result["id"]:
                    entry["body_sha256"] = result["body_sha256"]
                    entry["content_type"] = result["content_type"]
                    entry["status_code"] = result["status_code"]
                    break
        with (_FIXTURES_ROOT / "MANIFEST.json").open("w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2)
            fh.write("\n")
        print(f"[manifest] updated {len(captured)} entries")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Capture real-service responses into the recorded-real fixtures."
    )
    parser.add_argument(
        "--fixture", action="append", default=[],
        help="Fixture id(s) to capture. Repeat to capture multiple. "
             "Omit to capture all registered fixtures.",
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Overwrite an existing fixture body (default: refuse).",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would be captured without making HTTP requests.",
    )
    args = parser.parse_args()

    offline = os.environ.get("SPHEREX_ODYSSEY_OFFLINE", "1") != "0"
    if offline and not args.dry_run:
        print("[guard] SPHEREX_ODYSSEY_OFFLINE is set. Refusing to make a live "
              "HTTP request. Either unset SPHEREX_ODYSSEY_OFFLINE or pass "
              "--dry-run. The capture script is manual-only.")
        return 1

    if not args.fixture:
        args.fixture = [entry["id"] for entry in list_fixtures()]
    return asyncio.run(_capture_all(args.fixture, force=args.force, dry_run=args.dry_run))


if __name__ == "__main__":
    raise SystemExit(main())
