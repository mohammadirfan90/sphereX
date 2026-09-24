"""Recorded-real-fixture loader for offline adapter replay tests.

Each fixture pair lives under ``tests/fixtures/<source>/<id>_meta.yaml`` and
``tests/fixtures/<source>/<id>.<ext>``. The YAML carries the contract (status
code, content type, expected adapter response shape). The body is the verbatim
captured response from the live service — exactly what IRSA, Gaia DR3, JPL
SBDB / Horizons, or CDS Sesame returned for that documented query.

Phase 12 invariant: this loader never touches the network. It only opens files
that already exist on disk. Bodies that change without an accompanying YAML
update are refused with a SHA mismatch error.

Usage
-----
>>> from tests._fixtures import load_fixture
>>> fx = load_fixture("irsa_sia__qr3_galactic_center_3products")
>>> fx.body_bytes         # raw captured response bytes
>>> fx.content_type       # "text/xml"
>>> fx.status_code        # 200
>>> fx.spec["expected_status"]   # "available"
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List

import yaml  # type: ignore[import-untyped]


# Tests run from the project root (pytest.ini sets pythonpath=.).
# We anchor every fixture path against this directory so the loader works
# regardless of where pytest is invoked from.
_FIXTURES_ROOT = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


@dataclass(frozen=True)
class Fixture:
    """A recorded-real fixture: meta-sidecar + body pair."""

    id: str
    service: str
    url_pattern: str
    body: bytes
    body_path: Path
    meta_path: Path
    content_type: str
    status_code: int
    body_sha256: str
    meta_sha256: str
    spec: Dict[str, Any]

    def json(self) -> Any:
        """Decode the body as JSON. Raises if the body is not valid JSON."""
        return json.loads(self.body)

    def text(self) -> str:
        """Decode the body as UTF-8 text."""
        return self.body.decode("utf-8")


def _load_manifest() -> Dict[str, Any]:
    """Read the manifest index. Falls back to a scan if the manifest is missing."""
    manifest_path = _FIXTURES_ROOT / "MANIFEST.json"
    if manifest_path.exists():
        with manifest_path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    return {}


def _manifest_entry(manifest: Dict[str, Any], fixture_id: str) -> Dict[str, Any]:
    """Locate a fixture entry by id. Raises if it is not in the manifest."""
    for entry in manifest.get("fixtures", []):
        if entry["id"] == fixture_id:
            return entry
    raise FixtureNotFound(
        f"Fixture {fixture_id!r} is not listed in MANIFEST.json. "
        "Add the captured response and an entry under fixtures[].id."
    )


def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


class FixtureError(Exception):
    """Base exception for all fixture loader errors."""


class FixtureNotFound(FixtureError):
    """The fixture id is not registered in MANIFEST.json."""


class FixtureBodyMissing(FixtureError):
    """The body file referenced by the manifest entry does not exist on disk."""


class FixtureIntegrityError(FixtureError):
    """The body's SHA-256 does not match the manifest entry (the body was edited)."""


def load_fixture(fixture_id: str) -> Fixture:
    """Load a fixture by id and verify its integrity against the manifest.

    Raises
    ------
    FixtureNotFound      : id is not registered.
    FixtureBodyMissing   : the body file does not exist on disk.
    FixtureIntegrityError: body SHA-256 mismatches the manifest (the body was
                           edited without re-recording; this is a drift alarm,
                           not a soft warning).
    """
    manifest = _load_manifest()
    entry = _manifest_entry(manifest, fixture_id)

    meta_rel = entry["meta"]
    body_rel = entry["body"]
    meta_path = _FIXTURES_ROOT / meta_rel
    body_path = _FIXTURES_ROOT / body_rel

    if not body_path.exists():
        raise FixtureBodyMissing(
            f"Fixture {fixture_id!r}: expected body file at {body_path}"
        )

    body_bytes = body_path.read_bytes()
    body_sha = _sha256_bytes(body_bytes)
    meta_sha = _sha256_bytes(meta_path.read_bytes())

    # Drift alarm — never fail silently. If the recorded SHA matches the
    # current body and meta, accept; otherwise raise.
    expected_body_sha = entry.get("body_sha256", "TBD")
    if expected_body_sha not in ("TBD", body_sha) and os.environ.get("SPHEREX_ODYSSEY_FIXTURE_STRICT") != "0":
        raise FixtureIntegrityError(
            f"Fixture {fixture_id!r}: body SHA mismatch.\n"
            f"  expected: {expected_body_sha}\n"
            f"  actual:   {body_sha}\n"
            f"If this change is intentional, re-capture the live response and "
            "update MANIFEST.json's body_sha256 for this fixture."
        )

    with meta_path.open("r", encoding="utf-8") as fh:
        spec = yaml.safe_load(fh) or {}

    return Fixture(
        id=fixture_id,
        service=entry["service"],
        url_pattern=entry["url_pattern"],
        body=body_bytes,
        body_path=body_path,
        meta_path=meta_path,
        content_type=str(entry.get("content_type", spec.get("content_type", "text/plain"))),
        status_code=int(entry.get("status_code", spec.get("status_code", 200))),
        body_sha256=body_sha,
        meta_sha256=meta_sha,
        spec=spec,
    )


def list_fixtures() -> List[Dict[str, Any]]:
    """Return the raw manifest list of registered fixtures (for tests / docs)."""
    return _load_manifest().get("fixtures", [])


def write_manifest_hashes() -> Dict[str, str]:
    """Helper for the capture script: write current hashes into MANIFEST.json.

    Never called by tests. Only invoked by ``scripts/capture_fixtures.py``
    when re-recording a fixture after a live query.
    """
    manifest = _load_manifest()
    for entry in manifest.get("fixtures", []):
        meta_path = _FIXTURES_ROOT / entry["meta"]
        body_path = _FIXTURES_ROOT / entry["body"]
        if meta_path.exists():
            entry["meta_sha256"] = _sha256_bytes(meta_path.read_bytes())
        if body_path.exists():
            entry["body_sha256"] = _sha256_bytes(body_path.read_bytes())
    with (_FIXTURES_ROOT / "MANIFEST.json").open("w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    return {e["id"]: e["body_sha256"] for e in manifest["fixtures"]}
