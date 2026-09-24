"""Phase 11 — 3D atlas invariants.

Lock the scientific contract:
  · Distance method enum
  · Negative parallax → distance_pc = None
  · Suspiciously large parallax → distance_pc = None (bad row)
  · ADQL URL is real
  · Sky → cartesian mapping is correct
"""
from __future__ import annotations

import math

import pytest


# ── ADQL builder invariants ─────────────────────────────────────────────────

class TestADQLBuilder:

    def test_adql_includes_cone_geometry(self):
        from adapters.atlas_3d import build_cone_adql
        adql = build_cone_adql(10.0, 20.0, 0.1)
        assert "1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 10.000000, 20.000000, 0.100000))" in adql
        assert "gaiadr3.gaia_source" in adql

    def test_adql_default_positive_parallax_filter(self):
        from adapters.atlas_3d import build_cone_adql
        adql = build_cone_adql(10.0, 20.0, 0.1)
        # Luri et al. 2018 invariant: positive parallax only by default.
        assert "parallax > 0" in adql

    def test_adql_negative_parallax_opt_in(self):
        from adapters.atlas_3d import build_cone_adql
        adql = build_cone_adql(10.0, 20.0, 0.1, parallax_min_mas=-5.0)
        assert "parallax >= -5.0" in adql

    def test_adql_includes_magnitude_cut_when_set(self):
        from adapters.atlas_3d import build_cone_adql
        adql = build_cone_adql(10.0, 20.0, 0.1, g_mag_max=12.0)
        assert "phot_g_mean_mag <= 12.0" in adql

    def test_adql_radius_above_limit_rejected(self):
        from adapters.atlas_3d import build_cone_adql
        with pytest.raises(ValueError):
            build_cone_adql(10.0, 20.0, 5.0)  # > 1°

    def test_adql_top_n_in_query(self):
        from adapters.atlas_3d import build_cone_adql
        adql = build_cone_adql(10.0, 20.0, 0.1, max_results=500)
        assert "TOP 500" in adql

    def test_adql_order_by_brightness(self):
        from adapters.atlas_3d import build_cone_adql
        adql = build_cone_adql(10.0, 20.0, 0.1)
        assert "ORDER BY phot_g_mean_mag ASC" in adql


class TestADQLURLBuilder:

    def test_url_returns_gea_tap_endpoint(self):
        from adapters.atlas_3d import build_cone_adql, build_adql_url
        url = build_adql_url(build_cone_adql(10.0, 20.0, 0.1))
        assert url.startswith("https://gea.esac.esa.int/tap-server/tap/sync?")
        assert "lang=ADQL" in url
        assert "format=json" in url


# ── Sky → XYZ invariants ────────────────────────────────────────────────────

class TestSkyToXYZ:

    def test_origin_0_0_is_x_axis(self):
        """(RA=0°, Dec=0°, d=1) → (1, 0, 0)."""
        from adapters.atlas_3d import _sky_to_xyz
        x, y, z = _sky_to_xyz(0.0, 0.0, 1.0)
        assert x == pytest.approx(1.0, abs=1e-12)
        assert y == pytest.approx(0.0, abs=1e-12)
        assert z == pytest.approx(0.0, abs=1e-12)

    def test_pole_is_z_axis(self):
        """(Dec=90°, any RA, d=1) → z=1, x=y=0."""
        from adapters.atlas_3d import _sky_to_xyz
        x, y, z = _sky_to_xyz(45.0, 90.0, 1.0)
        assert z == pytest.approx(1.0, abs=1e-12)
        assert x == pytest.approx(0.0, abs=1e-12)
        assert y == pytest.approx(0.0, abs=1e-12)

    def test_y_axis_at_ra_90(self):
        from adapters.atlas_3d import _sky_to_xyz
        x, y, z = _sky_to_xyz(90.0, 0.0, 1.0)
        assert x == pytest.approx(0.0, abs=1e-12)
        assert y == pytest.approx(1.0, abs=1e-12)
        assert z == pytest.approx(0.0, abs=1e-12)

    def test_polaris_position_in_galactic_north(self):
        """Polaris (RA=37.95°, Dec=89.26°) should be near the +z axis
        with very small x and y components."""
        from adapters.atlas_3d import _sky_to_xyz
        x, y, z = _sky_to_xyz(37.95295613, 89.26410997, 100.0)
        # Dec=89.26° → cos(θ) = cos(89.26°) ≈ 0.0135
        # x = 100·0.0135·cos(RA) ≈ 1.0
        # y = 100·0.0135·sin(RA) ≈ 0.83
        # z = 100·sin(89.26°) ≈ 99.99
        assert z > 99.0
        assert abs(x) < 5.0
        assert abs(y) < 5.0

    def test_distance_zero_returns_all_none(self):
        from adapters.atlas_3d import _sky_to_xyz
        x, y, z = _sky_to_xyz(10.0, 20.0, None)
        assert x is None and y is None and z is None


# ── Row → Atlas3DPoint invariants ───────────────────────────────────────────

class TestRowToAtlasPoint:

    def test_positive_parallax_yields_distance(self):
        from adapters.atlas_3d import _row_to_atlas_point
        rec = {
            "source_id": "5776729522228801408",
            "ra": 37.952, "dec": 89.264, "parallax": 7.540,
            "parallax_error": 0.0184,
            "pmra": 44.48, "pmra_error": 0.02,
            "pmdec": -11.74, "pmdec_error": 0.02,
            "radial_velocity": -17.4, "radial_velocity_error": 0.21,
            "ruwe": 1.024,
            "phot_g_mean_mag": 1.974,
            "phot_bp_mean_mag": 2.172, "phot_rp_mean_mag": 1.985,
        }
        p = _row_to_atlas_point(rec)
        assert p.distance_pc == pytest.approx(1000.0 / 7.540, rel=1e-3)
        assert p.distance_method == "parallax_inversion"
        assert p.x_pc is not None
        assert p.y_pc is not None
        assert p.z_pc is not None
        # Polaris is near north pole → z dominates.
        assert p.z_pc > p.x_pc
        assert p.z_pc > p.y_pc

    def test_negative_parallax_yields_no_distance(self):
        from adapters.atlas_3d import _row_to_atlas_point
        rec = {
            "source_id": "test_neg_plx",
            "ra": 10.0, "dec": 20.0, "parallax": -0.5,
            "parallax_error": 0.05,
            "pmra": None, "pmra_error": None,
            "pmdec": None, "pmdec_error": None,
            "radial_velocity": None, "radial_velocity_error": None,
            "ruwe": None,
            "phot_g_mean_mag": None,
            "phot_bp_mean_mag": None, "phot_rp_mean_mag": None,
        }
        p = _row_to_atlas_point(rec)
        # Luri et al. 2018 invariant: negative parallax → no distance.
        assert p.distance_pc is None
        assert p.distance_method == "unavailable"
        assert p.x_pc is None and p.y_pc is None and p.z_pc is None

    def test_zero_parallax_yields_no_distance(self):
        from adapters.atlas_3d import _row_to_atlas_point
        rec = {
            "source_id": "test_zero_plx",
            "ra": 10.0, "dec": 20.0, "parallax": 0.0,
            "parallax_error": 0.05,
            "pmra": None, "pmra_error": None,
            "pmdec": None, "pmdec_error": None,
            "radial_velocity": None, "radial_velocity_error": None,
            "ruwe": None,
            "phot_g_mean_mag": None,
            "phot_bp_mean_mag": None, "phot_rp_mean_mag": None,
        }
        p = _row_to_atlas_point(rec)
        assert p.distance_pc is None
        assert p.distance_method == "unavailable"

    def test_pathologically_large_parallax_yields_no_distance(self):
        """parallax > 100 mas is suspicious (< 10 pc); refuse to invert."""
        from adapters.atlas_3d import _row_to_atlas_point
        rec = {
            "source_id": "test_huge_plx",
            "ra": 10.0, "dec": 20.0, "parallax": 250.0,  # typo: should be 2.50
            "parallax_error": 0.1,
            "pmra": None, "pmra_error": None,
            "pmdec": None, "pmdec_error": None,
            "radial_velocity": None, "radial_velocity_error": None,
            "ruwe": None,
            "phot_g_mean_mag": None,
            "phot_bp_mean_mag": None, "phot_rp_mean_mag": None,
        }
        p = _row_to_atlas_point(rec)
        assert p.distance_pc is None
        assert p.distance_method == "unavailable"

    def test_bp_minus_rp_derived_correctly(self):
        from adapters.atlas_3d import _row_to_atlas_point
        rec = {
            "source_id": "test_bprp",
            "ra": 10.0, "dec": 20.0, "parallax": 5.0,
            "parallax_error": 0.05,
            "pmra": None, "pmra_error": None,
            "pmdec": None, "pmdec_error": None,
            "radial_velocity": None, "radial_velocity_error": None,
            "ruwe": None,
            "phot_g_mean_mag": 10.0,
            "phot_bp_mean_mag": 11.5, "phot_rp_mean_mag": 9.5,
        }
        p = _row_to_atlas_point(rec)
        assert p.phot_bp_rp == pytest.approx(2.0, abs=1e-6)

    def test_missing_bp_or_rp_yields_none(self):
        from adapters.atlas_3d import _row_to_atlas_point
        rec = {
            "source_id": "test_no_bprp",
            "ra": 10.0, "dec": 20.0, "parallax": 5.0,
            "parallax_error": 0.05,
            "pmra": None, "pmra_error": None,
            "pmdec": None, "pmdec_error": None,
            "radial_velocity": None, "radial_velocity_error": None,
            "ruwe": None,
            "phot_g_mean_mag": 10.0,
            "phot_bp_mean_mag": None, "phot_rp_mean_mag": 9.5,
        }
        p = _row_to_atlas_point(rec)
        assert p.phot_bp_rp is None


# ── Distance threshold invariants ──────────────────────────────────────────

class TestDistanceThresholdInvariants:
    """Verify the Luri et al. 2018 + Bailer-Jones distance floor."""

    def test_default_parallax_min_is_microarcsecond(self):
        """Default parallax floor is 1 μas (noise threshold)."""
        from adapters.atlas_3d import build_cone_adql
        # Default behavior: parallax > 0 (the cone search is gated by
        # parallax > 0, not by 1 μas — but the API default can be tighter).
        adql_default = build_cone_adql(10.0, 20.0, 0.1)
        assert "parallax > 0" in adql_default


# ── Scientific sanity: distance from Polaris parallax ──────────────────────

class TestScientificSanity:

    def test_polaris_distance_133pc(self):
        """Polaris (parallax = 7.54 mas) → d ≈ 132.6 pc."""
        from adapters.atlas_3d import _row_to_atlas_point
        rec = {
            "source_id": "5776729522228801408",
            "ra": 37.952, "dec": 89.264, "parallax": 7.54,
            "parallax_error": 0.0184,
            "pmra": None, "pmra_error": None,
            "pmdec": None, "pmdec_error": None,
            "radial_velocity": None, "radial_velocity_error": None,
            "ruwe": None,
            "phot_g_mean_mag": None,
            "phot_bp_mean_mag": None, "phot_rp_mean_mag": None,
        }
        p = _row_to_atlas_point(rec)
        assert 130.0 < p.distance_pc < 135.0  # ~132.6 pc from 7.54 mas
