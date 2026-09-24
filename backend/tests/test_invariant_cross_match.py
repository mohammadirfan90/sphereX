"""Phase 7 - Cross-survey matching invariants.

Lock the scientific contract:
  * Per-survey cone radius selection
  * Closest-row selection picks the smallest separation
  * CMB frame conversion is bounded by |v_LG|/c
  * Frame correction direction: GC and anticenter must be opposite signs
  * High-z frames pass through unchanged
"""
from __future__ import annotations

import math
import pytest


# ── Geometry invariants ─────────────────────────────────────────────────────


class TestAngularSeparation:

    def test_zero_separation_for_same_point(self):
        from adapters.cross_match import angular_separation_arcsec
        sep = angular_separation_arcsec(10.0, 20.0, 10.0, 20.0)
        assert sep < 1e-9

    def test_one_degree_in_ra_on_equator(self):
        from adapters.cross_match import angular_separation_arcsec
        sep = angular_separation_arcsec(0.0, 0.0, 1.0, 0.0)
        assert abs(sep - 3600.0) < 1e-6

    def test_one_degree_in_dec(self):
        from adapters.cross_match import angular_separation_arcsec
        sep = angular_separation_arcsec(0.0, 0.0, 0.0, 1.0)
        assert abs(sep - 3600.0) < 1e-6

    def test_antipodal_is_180_degrees(self):
        from adapters.cross_match import angular_separation_arcsec
        sep = angular_separation_arcsec(0.0, 0.0, 180.0, 0.0)
        assert abs(sep - 180.0 * 3600.0) < 1.0


# ── Closest-row invariants ──────────────────────────────────────────────────


class TestClosestRow:

    def test_picks_smallest_separation(self):
        from adapters.cross_match import closest_row
        rows = [
            {"ra": 10.01, "dec": 20.01},
            {"ra": 10.001, "dec": 20.001},
            {"ra": 10.05, "dec": 20.05},
        ]
        best, sep = closest_row(rows, ra_deg=10.0, dec_deg=20.0)
        assert best is not None
        assert best["ra"] == 10.001
        # 0.001 deg at Dec=20 -> ~4.94 arcsec
        assert 4.5 < sep < 5.5

    def test_empty_list_returns_none(self):
        from adapters.cross_match import closest_row
        best, sep = closest_row([], ra_deg=0.0, dec_deg=0.0)
        assert best is None
        assert math.isinf(sep)

    def test_skips_rows_without_position(self):
        from adapters.cross_match import closest_row
        rows = [
            {"ra": None, "dec": None, "mag": 12},
            {"ra": 10.001, "dec": 20.001},
        ]
        best, sep = closest_row(rows, ra_deg=10.0, dec_deg=20.0)
        assert best is not None
        assert best["ra"] == 10.001


# ── Frame conversion invariants ─────────────────────────────────────────────


class TestFrameConversion:

    def test_cmb_correction_varies_across_sky(self):
        """Local Group has non-zero CMB velocity; correction varies in space."""
        from adapters.cross_match import helio_to_cmb_z
        z_gc = helio_to_cmb_z(0.005, 266.4, -29.0)
        z_anticenter = helio_to_cmb_z(0.005, 86.4, 28.9)
        # Both differ from input.
        assert abs(z_gc - 0.005) > 1e-5
        assert abs(z_anticenter - 0.005) > 1e-5
        # Opposite signs.
        assert (z_gc - 0.005) * (z_anticenter - 0.005) < 0

    def test_cmb_correction_high_z_passthrough(self):
        from adapters.cross_match import helio_to_cmb_z
        z = 1.5
        assert helio_to_cmb_z(z, 0.0, 0.0) == z

    def test_cmb_correction_handles_nan(self):
        from adapters.cross_match import helio_to_cmb_z
        assert math.isnan(helio_to_cmb_z(float("nan"), 0.0, 0.0))

    def test_cmb_correction_magnitude_bounded(self):
        """Frame correction is bounded by |v_LG|/c. With Carrick+2015
        velocity (74, 250, -310) km/s, |v_LG| ~ 405 km/s -> max |dz| ~ 1.35e-3."""
        from adapters.cross_match import helio_to_cmb_z
        bound = math.sqrt(74 ** 2 + 250 ** 2 + 310 ** 2) / 299792.458
        z_helio = 0.005
        for ra, dec in [
            (266.4, -29.0),
            (86.4, 28.9),
            (192.85, 27.13),
            (12.0, 45.0),
            (300.0, -10.0),
        ]:
            z_cmb = helio_to_cmb_z(z_helio, ra, dec)
            assert abs(z_cmb - z_helio) <= bound * 1.001


# ── Cone validation invariants ──────────────────────────────────────────────


class TestConeValidation:

    def test_invalid_ra_rejected(self):
        from adapters.cross_match import cross_match_at_position, CrossMatchConeInvalid
        with pytest.raises(CrossMatchConeInvalid):
            import asyncio
            asyncio.run(cross_match_at_position(ra_deg=400.0, dec_deg=0.0))

    def test_invalid_dec_rejected(self):
        from adapters.cross_match import cross_match_at_position, CrossMatchConeInvalid
        with pytest.raises(CrossMatchConeInvalid):
            import asyncio
            asyncio.run(cross_match_at_position(ra_deg=0.0, dec_deg=-91.0))

    def test_zero_radius_rejected(self):
        from adapters.cross_match import cross_match_at_position, CrossMatchConeInvalid
        with pytest.raises(CrossMatchConeInvalid):
            import asyncio
            asyncio.run(cross_match_at_position(ra_deg=0.0, dec_deg=0.0, radius_arcsec=0.0))

    def test_negative_radius_rejected(self):
        from adapters.cross_match import cross_match_at_position, CrossMatchConeInvalid
        with pytest.raises(CrossMatchConeInvalid):
            import asyncio
            asyncio.run(cross_match_at_position(ra_deg=0.0, dec_deg=0.0, radius_arcsec=-1.0))

    def test_oversized_radius_rejected(self):
        from adapters.cross_match import cross_match_at_position, CrossMatchConeInvalid
        with pytest.raises(CrossMatchConeInvalid):
            import asyncio
            asyncio.run(cross_match_at_position(ra_deg=0.0, dec_deg=0.0, radius_arcsec=601.0))


# ── Default cone invariants ────────────────────────────────────────────────


class TestDefaultCones:

    def test_gaia_default_1_arcsec(self):
        from adapters.cross_match import DEFAULT_GAIA_CONE_ARCSEC
        assert DEFAULT_GAIA_CONE_ARCSEC == 1.0

    def test_ned_default_5_arcsec(self):
        from adapters.cross_match import DEFAULT_NED_CONE_ARCSEC
        assert DEFAULT_NED_CONE_ARCSEC == 5.0

    def test_hips_default_30_arcsec(self):
        from adapters.cross_match import DEFAULT_HIPS_CONE_ARCSEC
        assert DEFAULT_HIPS_CONE_ARCSEC == 30.0

    def test_ambiguity_threshold(self):
        from adapters.cross_match import AMBIGUITY_THRESHOLD_ARCSEC
        assert AMBIGUITY_THRESHOLD_ARCSEC == 0.1


# ── Scientific sanity ───────────────────────────────────────────────────────


class TestScientificSanity:

    def test_galactic_center_correction_negative(self):
        """At the GC (l=0, b=0), the LG CMB velocity +U component is +74 km/s.
        Adding this to the heliocentric recession velocity shifts z_cmb DOWN."""
        from adapters.cross_match import helio_to_cmb_z
        z_helio = 0.005
        z_cmb = helio_to_cmb_z(z_helio, 266.4, -29.0)
        assert z_cmb < z_helio
        # |delta z| ~ |v_LG|/c ~ 2.45e-4 for z=0.005.
        assert 1e-5 < abs(z_helio - z_cmb) < 0.001

    def test_anticenter_correction_positive(self):
        """At the anticenter (l=180), -U component dominates; opposite sign."""
        from adapters.cross_match import helio_to_cmb_z
        z_helio = 0.005
        z_cmb_anti = helio_to_cmb_z(z_helio, 86.4, 28.9)
        z_cmb_gc = helio_to_cmb_z(z_helio, 266.4, -29.0)
        assert (z_cmb_anti - z_helio) * (z_cmb_gc - z_helio) < 0
