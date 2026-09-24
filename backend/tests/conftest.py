"""Pytest configuration: offline-mode enforcement and fixture hooks.

Phase 12 invariants enforced by this conftest:

1. ``SPHEREX_ODYSSEY_OFFLINE`` is set for the duration of the test session so
   adapters that respect it will refuse to make outbound network calls.

2. A session-scoped ``fixtures_root`` fixture exposes the absolute path of the
   recorded-real fixtures directory so test modules do not hard-code paths.

3. ``mock_http_response`` is a context-manager helper that monkeypatches
   ``httpx.AsyncClient.send`` to return a pre-loaded Fixture body. It is the
   single hook adapters use to be exercised offline — never a real network
   call.

The fixtures themselves are loaded by ``tests._fixtures.load_fixture``, which
performs the SHA-256 integrity check on every read.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import List

import pytest


# Hard offline mode: if any test module accidentally tries to call out to
# IRSA, Gaia, JPL, or CDS during pytest, this hook refuses the request. Set
# SPHEREX_ODYSSEY_OFFLINE=0 to explicitly opt out (used by the manual capture
# script, never by tests).
os.environ.setdefault("SPHEREX_ODYSSEY_OFFLINE", "1")


@pytest.fixture(scope="session")
def fixtures_root() -> Path:
    """Absolute path of the recorded-real fixtures directory."""
    return Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(scope="session")
def fixture_ids() -> List[str]:
    """All fixture ids registered in MANIFEST.json."""
    from tests._fixtures import list_fixtures
    return [entry["id"] for entry in list_fixtures()]


@pytest.fixture
def mock_http_response(monkeypatch: pytest.MonkeyPatch):
    """Patch ``httpx.AsyncClient.send`` so a single request returns a Fixture body.

    Usage
    -----
    >>> def test_x(mock_http_response, fx_spherex_qr3_3products):
    ...     def handler(request):
    ...         return _build_response(fx_spherex_qr3_3products, request)
    ...     with mock_http_response(handler):
    ...         result = await query_spherex_sia(266.4, -29.0)
    """
    import httpx

    def _install(handler):
        # httpx 0.27+ routes every request through AsyncClient.send.
        # We override that method so we can intercept based on the request URL.
        original_send = httpx.AsyncClient.send

        async def fake_send(self, request, *args, **kwargs):
            return handler(request)

        monkeypatch.setattr(httpx.AsyncClient, "send", fake_send)
        return original_send

    return _install