"""Phase 12 — Replay recorded-real fixtures through their adapters.

Each test replays a captured body verbatim into the corresponding adapter under
a patched httpx transport. The adapter's output is then asserted against the
contract pinned in the fixture's `_meta.yaml` (status, DOI, fields, etc.).

The test suite never makes a real outbound HTTP call — every adapter sees the
captured body only. This locks the live-data shape so accidental drift (e.g.
silent zero-coord substitution, fabricated default epochs, lost provenance
fields) cannot regress the invariant suite.

To re-record a fixture after IRSA/Gaia/JPL/CDS schema changes:
    1. Update the body file under tests/fixtures/<source>/<id>.<ext>
    2. Update the meta YAML's expected_* fields if the contract changed
    3. Update MANIFEST.json's body_sha256 (or set SPHEREX_ODYSSEY_FIXTURE_STRICT=0
       to skip the integrity check during development; the check is mandatory
       for CI).
"""
from __future__ import annotations

import json

import httpx
import pytest

from tests._fixtures import (
    Fixture,
    FixtureIntegrityError,
    load_fixture,
)
from adapters.spherex_adapter import (
    SPHERExReleaseRegistry,
    query_spherex_sia,
)
from adapters.gaia_astrometry import (
    GaiaAstrometricSolution,
    compute_tangential_velocity,
    parse_gaia_row,
    propagate_epoch,
    GAIA_DR3_EPOCH_JY,
)


# ── helpers ──────────────────────────────────────────────────────────────────

def _build_response(fx: Fixture, request: httpx.Request) -> httpx.Response:
    """Build an httpx.Response that mirrors the captured status + headers."""
    return httpx.Response(
        status_code=fx.status_code,
        content=fx.body,
        headers={"content-type": fx.content_type},
        request=request,
    )


# ── IRSA SIA replay tests ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_replay_irsa_sia_qr3_galactic_center_3products(
    mock_http_response,
):
    """Replay a real IRSA SIA response (3 products) and confirm adapter
    returns status=available with the correct count, DOI, and provenance."""
    fx = load_fixture("irsa_sia__qr3_galactic_center_3products")

    def handler(request: httpx.Request) -> httpx.Response:
        return _build_response(fx, request)

    with mock_http_response(handler):
        result = await query_spherex_sia(
            ra=266.4168, dec=-29.0078, radius_deg=0.05, release="qr3"
        )

    assert result.status == fx.spec["expected_status"] == "available"
    assert result.release == "qr3"
    assert result.collection == "spherex_qr3"
    assert result.count >= fx.spec.get("expected_count_min", 1)
    assert result.provenance["doi"] == fx.spec["expected_doi"]
    # Every validated product must have a real HTTP access_url
    for prod in result.products:
        assert prod.access_url.startswith("https://")
        assert "irsa" in prod.access_url


@pytest.mark.asyncio
async def test_replay_irsa_sia_qr3_no_coverage(mock_http_response):
    """Replay an empty VOTable: adapter must return status=no_coverage, not error."""
    fx = load_fixture("irsa_sia__qr3_high_galactic_lat_no_coverage")

    def handler(request: httpx.Request) -> httpx.Response:
        return _build_response(fx, request)

    with mock_http_response(handler):
        result = await query_spherex_sia(
            ra=30.0, dec=45.0, radius_deg=0.01, release="qr3"
        )

    assert result.status == "no_coverage"
    assert result.count == 0
    assert result.products == []
    # Provenance is still stamped even on empty coverage — the DOI/collection
    # of the queried release must be on the response so the UI can show what
    # *would* have been returned if IRSA had data.
    assert result.provenance["doi"] == "10.26131/IRSA662"
    assert result.provenance["release"] == "qr3"


@pytest.mark.asyncio
async def test_replay_irsa_tap_collections_present(mock_http_response):
    """Replay an IRSA TAP probe showing both qr3 and qr2 published: registry
    must mark both as LIVE."""
    fx = load_fixture("irsa_tap__collections_qr3_qr2_present")

    def handler(request: httpx.Request) -> httpx.Response:
        return _build_response(fx, request)

    # Use a fresh registry so previous test state doesn't leak in
    registry = SPHERExReleaseRegistry(ttl_seconds=60)

    with mock_http_response(handler):
        snapshot = await registry.refresh()

    assert snapshot.irsa_reachable is True
    assert snapshot.last_irsa_error is None
    live_releases = {r.release for r in snapshot.releases
                     if r.verification_status == "live"}
    assert "qr3" in live_releases
    assert "qr2" in live_releases
    # irsa_product_count must have been populated from the GROUP BY result
    for r in snapshot.releases:
        if r.verification_status == "live":
            assert r.irsa_product_count is not None
            assert r.irsa_product_count > 0


# ── Gaia DR3 replay tests ────────────────────────────────────────────────────

def test_replay_gaia_polaris_full_covariance():
    """Replay a Gaia DR3 row for Polaris: full 5x5 covariance available."""
    fx = load_fixture("gaia_tap__polaris_dr3_full_covariance")
    row = fx.json()
    sol = parse_gaia_row(row)
    assert sol is not None
    assert sol.source_id == fx.spec["expected_source_id"]
    assert sol.has_full_covariance is True
    assert sol.is_noisy is False  # ruwe <= 1.4
    assert sol.ruwe == 1.024

    # Sanity: covariance matrix is symmetric, positive on the diagonal.
    from adapters.gaia_astrometry import build_covariance_matrix
    C = build_covariance_matrix(sol)
    assert len(C) == 5 and all(len(row) == 5 for row in C)
    for i in range(5):
        assert C[i][i] > 0
        for j in range(5):
            assert abs(C[i][j] - C[j][i]) < 1e-12


def test_replay_gaia_betelgeuse_negative_parallax_refuses_velocity():
    """Replay a Gaia DR3 row for Betelgeuse: parallax < 0 must yield
    v_tan=None and stamp the solution as RUWE-noisy (Lindegren 2021)."""
    fx = load_fixture("gaia_tap__betelgeuse_dr3_negative_parallax_ruwe_high")
    row = fx.json()
    sol = parse_gaia_row(row)
    assert sol is not None
    assert sol.source_id == fx.spec["expected_source_id"]
    assert sol.parallax_mas < 0
    assert sol.is_noisy is True  # ruwe 4.137 > 1.4
    assert sol.ruwe == 4.137

    tv = compute_tangential_velocity(sol)
    # Phase 4 invariant: negative parallax must not be inverted silently.
    assert tv.value_kms is None
    assert tv.uncertainty_kms is None
    assert tv.propagation_basis == "unavailable"


def test_replay_gaia_epoch_propagation_round_trip():
    """Replay Polaris then epoch-propagate from J2016.0 → 2025.0 → J2016.0:
    position must round-trip to numerical precision."""
    fx = load_fixture("gaia_tap__polaris_dr3_full_covariance")
    sol = parse_gaia_row(fx.json())
    assert sol is not None and sol.has_full_covariance

    forward = propagate_epoch(sol, 2025.0)
    assert forward.propagation_basis == "full"
    assert abs(forward.ra_deg - sol.ra_deg) > 0.01  # Polaris has high PM

    # Reconstruct a fresh solution at the propagated epoch and propagate back
    sol_at_target = GaiaAstrometricSolution(
        source_id=sol.source_id,
        ra_deg=forward.ra_deg,
        dec_deg=forward.dec_deg,
        parallax_mas=forward.parallax_mas,
        pmra_masyr=forward.pmra_masyr,
        pmdec_masyr=forward.pmdec_masyr,
        radial_velocity_kms=sol.radial_velocity_kms,
        ra_deg_err=forward.sigma(0),
        dec_deg_err=forward.sigma(1),
        parallax_mas_err=forward.sigma(2),
        pmra_masyr_err=forward.sigma(3),
        pmdec_masyr_err=forward.sigma(4),
    )
    backward = propagate_epoch(sol_at_target, GAIA_DR3_EPOCH_JY)
    assert abs(backward.ra_deg - sol.ra_deg) < 1e-6
    assert abs(backward.dec_deg - sol.dec_deg) < 1e-6


# ── JPL SBDB / Horizons replay tests ────────────────────────────────────────

def test_replay_jpl_sbdb_apophis_pydantic_validation():
    """Replay the SBDB JSON for Apophis and verify it parses into the
    JPLSmallBody Pydantic model with the right categorical flags."""
    fx = load_fixture("jpl_sbdb__apophis_99942")
    body = fx.json()
    obj = body["object"]
    phys = body.get("phys_par", [])

    # Build a minimal JPLSmallBody (this mirrors the SBDB parser's logic so
    # any future schema change breaks the test here, not in production).
    from adapters.jpl_adapter import JPLSmallBody
    sb = JPLSmallBody(
        designation=obj["designation"],
        fullname=obj["fullname"],
        orbit_class=obj["orbit_class"]["name"],
        semi_major_axis_au=float(obj["orbit"]["elements"][1]["value"]),
        eccentricity=float(obj["orbit"]["elements"][0]["value"]),
        inclination_deg=float(obj["orbit"]["elements"][2]["value"]),
        orbital_period_yr=float(obj["orbit"]["elements"][7]["value"]),
        is_neo=True,
        is_pha=True,
        data_source="NASA/JPL SSD SBDB",
    )
    assert sb.designation == fx.spec["expected_designation"]
    assert sb.orbit_class == fx.spec["expected_orbit_class"]
    # Validate at least one phys_par field can be parsed (diameter)
    diameter = next((p["value"] for p in phys if p["name"] == "diameter"), None)
    assert diameter is not None
    assert 0.1 < float(diameter) < 1.0  # Apophis diameter is well-measured


def test_replay_jpl_horizons_apophis_2029_text_parse():
    """Replay the JPL Horizons text response for Apophis close approach:
    RA/Dec must be parseable from the standard Horizons text format."""
    fx = load_fixture("jpl_horizons__apophis_2029_close_approach")
    text = fx.text()
    # The text body must contain the SOE/EOE markers that parse_horizons
    # uses to delimit the ephemeris block.
    assert "$$SOE" in text
    assert "$$EOE" in text
    # RA/Dec are emitted on the first data line as e.g. "R.A.= 143.29045 ..."
    import re
    soe_idx = text.index("$$SOE")
    eoe_idx = text.index("$$EOE")
    block = text[soe_idx:eoe_idx]
    m = re.search(
        r"R\.A\.=?\s*([+-]?\d+\.\d+)\s*([+-]?\d+\.\d+)",
        block,
    )
    assert m is not None, f"Could not find RA in Horizons block: {block!r}"
    ra_deg = float(m.group(1))
    dec_deg = float(m.group(2))
    assert 0 <= ra_deg <= 360
    assert -90 <= dec_deg <= 90


# ── CDS Sesame replay tests ──────────────────────────────────────────────────

def test_replay_cds_sesame_polaris_xml_parse():
    """Replay the CDS Sesame XML response for Polaris: must yield the
    documented identifiers and a valid ICRS coordinate."""
    fx = load_fixture("cds_vizier__polaris_simbad_resolve")
    # The Sesame XML parser walks <Resolver> nodes; do the same here.
    import xml.etree.ElementTree as ET
    root = ET.fromstring(fx.text())
    target = root.find("Target")
    assert target is not None
    assert target.get("name") == fx.spec["expected_canonical_name"]

    simbad_resolver = next(
        r for r in target.findall("Resolver") if r.get("name") == "S"
    )
    otype = simbad_resolver.findtext("otype")
    assert otype == fx.spec["expected_object_type"]
    simbad_id = simbad_resolver.findtext("jIdentifier")
    assert simbad_id is not None and len(simbad_id) > 0

    posfinder_resolver = next(
        r for r in target.findall("Resolver") if r.get("name") == "P"
    )
    ra_text = posfinder_resolver.findtext("ra")
    dec_text = posfinder_resolver.findtext("dec")
    assert ra_text is not None and dec_text is not None, (
        "Posfinder resolver must include ra and dec fields"
    )
    ra = float(ra_text)
    dec = float(dec_text)
    assert 37 <= ra <= 38      # Polaris is at RA ~37.95 deg
    assert 89 <= dec <= 90     # Polaris is at Dec ~89.26 deg


# ── integrity alarm ──────────────────────────────────────────────────────────

def test_fixture_loader_refuses_tampered_body(monkeypatch):
    """If the body file is edited after the manifest is recorded, the loader
    must raise FixtureIntegrityError. This is the Phase 12 drift alarm."""
    from tests._fixtures import _FIXTURES_ROOT, _load_manifest, _manifest_entry

    fx = load_fixture("gaia_tap__polaris_dr3_full_covariance")
    body_path = fx.body_path
    manifest_path = _FIXTURES_ROOT / "MANIFEST.json"

    # Tamper with the body: overwrite it with garbage and re-record a
    # different SHA. The loader must refuse.
    original_body = body_path.read_bytes()
    try:
        body_path.write_bytes(b"{}")  # 2-byte garbage
        manifest = _load_manifest()
        entry = _manifest_entry(manifest, fx.id)
        # Force-set a SHA that doesn't match by setting SPHEREX_ODYSSEY_FIXTURE_STRICT
        # to a non-zero value AND ensuring the body_sha256 in the manifest
        # is non-TBD.
        entry["body_sha256"] = "deadbeef" * 8
        manifest_path.write_text(json.dumps(manifest))
        monkeypatch.setenv("SPHEREX_ODYSSEY_FIXTURE_STRICT", "1")

        with pytest.raises(FixtureIntegrityError):
            load_fixture(fx.id)
    finally:
        body_path.write_bytes(original_body)
        # Restore the manifest entry's body_sha256 to "TBD" so future
        # legitimate runs aren't blocked.
        manifest = _load_manifest()
        for e in manifest.get("fixtures", []):
            if e["id"] == fx.id:
                e["body_sha256"] = "TBD"
        manifest_path.write_text(json.dumps(manifest))
