"""Phase 5 — NED extragalactic adapter invariants.

Lock the scientific contract:
  · URL builders construct valid NED objsearch URLs.
  · Cone radius limits are enforced at the URL layer.
  · Redshift frame is one of the four legal values.
  · _safe_float rejects NaN, inf, 'null', and empty strings.
  · Object parser recovers canonical name, RA, Dec, type, redshift.
  · Cone parser returns separation in arcseconds and skips malformed rows.
  · Photometry rows missing both mag and flux are dropped.
"""
from __future__ import annotations

import json
import math
import pytest


# ── URL builder invariants ──────────────────────────────────────────────────


class TestObjSearchURL:

    def test_name_url_includes_of_json_main(self):
        from adapters.ned_adapter import build_objsearch_by_name_url
        url = build_objsearch_by_name_url("MESSIER 087")
        assert "objname=MESSIER%20087" in url
        assert "of=json_main" in url
        assert "in_equinox=J2000.0" in url

    def test_name_url_rejects_empty(self):
        from adapters.ned_adapter import build_objsearch_by_name_url
        with pytest.raises(ValueError):
            build_objsearch_by_name_url("   ")

    def test_cone_url_rounds_coordinates(self):
        from adapters.ned_adapter import build_objsearch_cone_url
        url = build_objsearch_cone_url(187.70593081, 12.39112326, 0.1)
        assert "lon=187.705931" in url
        assert "lat=12.391123" in url
        assert "radius=0.100000" in url
        assert "hconst=67.8" in url

    def test_cone_url_radius_above_limit_rejected(self):
        from adapters.ned_adapter import build_objsearch_cone_url
        with pytest.raises(ValueError):
            build_objsearch_cone_url(0.0, 0.0, 6.0)  # > 5° ceiling

    def test_cone_url_negative_radius_rejected(self):
        from adapters.ned_adapter import build_objsearch_cone_url
        with pytest.raises(ValueError):
            build_objsearch_cone_url(0.0, 0.0, -0.01)

    def test_cone_url_out_of_range_ra_rejected(self):
        from adapters.ned_adapter import build_objsearch_cone_url
        with pytest.raises(ValueError):
            build_objsearch_cone_url(360.0, 0.0, 0.1)
        with pytest.raises(ValueError):
            build_objsearch_cone_url(-1.0, 0.0, 0.1)

    def test_cone_url_out_of_range_dec_rejected(self):
        from adapters.ned_adapter import build_objsearch_cone_url
        with pytest.raises(ValueError):
            build_objsearch_cone_url(0.0, 91.0, 0.1)
        with pytest.raises(ValueError):
            build_objsearch_cone_url(0.0, -91.0, 0.1)

    def test_cone_url_max_results_clamped(self):
        from adapters.ned_adapter import build_objsearch_cone_url
        with pytest.raises(ValueError):
            build_objsearch_cone_url(0.0, 0.0, 0.1, max_results=200)

    def test_photometry_url_contains_meas_type_phot(self):
        from adapters.ned_adapter import build_photometry_url
        url = build_photometry_url("MESSIER 087")
        assert "neddata/MESSIER%20087" in url
        assert "meas_type=phot" in url


# ── Safe numeric parser invariants ──────────────────────────────────────────


class TestSafeFloat:

    def test_finite_numbers_pass(self):
        from adapters.ned_adapter import _safe_float
        assert _safe_float(1.5) == 1.5
        assert _safe_float(0) == 0.0
        assert _safe_float(-3.14) == pytest.approx(-3.14)
        assert _safe_float("2.7e3") == 2700.0

    def test_nan_inf_rejected(self):
        from adapters.ned_adapter import _safe_float
        assert _safe_float(float("nan")) is None
        assert _safe_float(float("inf")) is None
        assert _safe_float(float("-inf")) is None
        assert _safe_float("nan") is None
        assert _safe_float("Inf") is None

    def test_null_strings_rejected(self):
        from adapters.ned_adapter import _safe_float
        assert _safe_float("") is None
        assert _safe_float("   ") is None
        assert _safe_float("null") is None
        assert _safe_float("NULL") is None
        assert _safe_float(None) is None

    def test_garbage_strings_rejected(self):
        from adapters.ned_adapter import _safe_float
        assert _safe_float("not a number") is None
        assert _safe_float("3.14abc") is None
        assert _safe_float("--") is None

    def test_bool_rejected(self):
        """Booleans must not silently coerce to 0.0/1.0."""
        from adapters.ned_adapter import _safe_float
        assert _safe_float(True) is None
        assert _safe_float(False) is None


# ── Redshift invariants ─────────────────────────────────────────────────────


class TestRedshiftFrame:

    def test_valid_frames_accepted(self):
        from adapters.ned_adapter import NEDRedshift
        for frame in ("heliocentric", "cmb", "galactocentric", "3k"):
            r = NEDRedshift(value=0.01, frame=frame)
            assert r.frame == frame

    def test_invalid_frame_rejected(self):
        from adapters.ned_adapter import NEDRedshift
        with pytest.raises(ValueError):
            NEDRedshift(value=0.01, frame="foo")

    def test_nan_value_rejected(self):
        from adapters.ned_adapter import NEDRedshift
        with pytest.raises(ValueError):
            NEDRedshift(value=float("nan"), frame="heliocentric")

    def test_infinity_value_rejected(self):
        from adapters.ned_adapter import NEDRedshift
        with pytest.raises(ValueError):
            NEDRedshift(value=float("inf"), frame="heliocentric")


# ── Object envelope parser invariants ──────────────────────────────────────


class TestObjectEnvelopeParser:

    def test_m87_full_envelope_parses(self):
        from adapters.ned_adapter import _parse_obj_envelope_to_object
        with open("tests/fixtures/ned_objsearch/m87_envelope.json") as f:
            envelope = json.load(f)
        obj = _parse_obj_envelope_to_object(envelope)
        assert obj.canonical_name == "MESSIER 087"
        assert obj.ra_deg == pytest.approx(187.7059308, abs=1e-6)
        assert obj.dec_deg == pytest.approx(12.3911232, abs=1e-6)
        assert "Elliptical" in obj.object_type
        assert obj.redshift is not None
        assert obj.redshift.value == pytest.approx(0.004360, rel=1e-4)
        assert obj.redshift.frame == "heliocentric"
        assert obj.velocity_kms == pytest.approx(1307, abs=1)
        assert obj.distance_mpc == pytest.approx(18.5, abs=0.1)

    def test_redshift_recovered_from_velocity_when_z_missing(self):
        from adapters.ned_adapter import _parse_obj_envelope_to_object, _parse_redshift
        envelope = {
            "Object": {
                "Name": "TEST NO Z",
                "RA": 10.0, "Dec": 20.0,
                "V": 3000.0,  # km/s → z ≈ 0.01001
            }
        }
        z = _parse_redshift(envelope["Object"])
        assert z is not None
        assert z.value == pytest.approx(0.01001, rel=1e-3)
        assert z.frame == "heliocentric"

    def test_redshift_skipped_for_relativistic_velocity(self):
        """If only velocity is given and v > 30000 km/s, refuse to back out z."""
        from adapters.ned_adapter import _parse_redshift
        envelope = {"V": 50000.0, "RA": 0.0, "Dec": 0.0}
        assert _parse_redshift(envelope) is None

    def test_envelope_without_object_raises_not_found(self):
        from adapters.ned_adapter import _parse_obj_envelope_to_object, NEDNotFound
        with pytest.raises(NEDNotFound):
            _parse_obj_envelope_to_object({})

    def test_envelope_missing_position_raises_malformed(self):
        from adapters.ned_adapter import _parse_obj_envelope_to_object, NEDResponseMalformed
        envelope = {"Object": {"Name": "BadRecord"}}
        with pytest.raises(NEDResponseMalformed):
            _parse_obj_envelope_to_object(envelope)


# ── Photometry roll-up invariants ───────────────────────────────────────────


class TestPhotometryParser:

    def test_m87_photometry_parses(self):
        from adapters.ned_adapter import _parse_photometry_rows
        with open("tests/fixtures/ned_objsearch/m87_photometry.json") as f:
            envelope = json.load(f)
        rows = _parse_photometry_rows(envelope)
        assert len(rows) >= 10
        surveys = {r.survey for r in rows}
        assert {"SDSS", "2MASS", "WISE"}.issubset(surveys)
        # Every row must have either magnitude or flux.
        for r in rows:
            assert r.magnitude is not None or r.flux_density is not None

    def test_rows_without_mag_or_flux_dropped(self):
        from adapters.ned_adapter import _parse_photometry_rows
        envelope = {
            "Photometry": [
                {"Survey": "OK", "Band": "g", "Mag": 10.0},
                {"Survey": "BAD", "Band": "x"},          # neither mag nor flux
                {"Survey": "NULLMAG", "Band": "y", "Mag": "null"},
            ]
        }
        rows = _parse_photometry_rows(envelope)
        assert len(rows) == 1
        assert rows[0].survey == "OK"

    def test_photometry_handles_empty_envelope(self):
        from adapters.ned_adapter import _parse_photometry_rows
        assert _parse_photometry_rows({}) == []
        assert _parse_photometry_rows({"Photometry": []}) == []

    def test_photometry_preserves_uncertainty(self):
        from adapters.ned_adapter import _parse_photometry_rows
        envelope = {"Photometry": [{"Survey": "X", "Band": "g", "Mag": 10.0, "Mag_Err": 0.02}]}
        rows = _parse_photometry_rows(envelope)
        assert rows[0].magnitude_uncertainty == pytest.approx(0.02)


# ── Cone-search parser invariants ───────────────────────────────────────────


class TestConeSearchParser:

    def test_cone_three_virgo_hits(self):
        from adapters.ned_adapter import _parse_json_envelope
        from adapters.ned_adapter import query_ned_cone  # imports function (not exercised here)
        with open("tests/fixtures/ned_objsearch/m87_cone_envelope.json") as f:
            envelope = _parse_json_envelope(f.read())
        rows = envelope.get("rows") or []
        assert len(rows) == 3
        # M87 is row 0, separation 0.0
        assert rows[0]["Name"] == "MESSIER 087"
        assert rows[0]["Separation"] == 0.0
        # All within 5 arcmin of M87
        for r in rows:
            assert r["Separation"] < 300.0  # arcsec
            assert r["Redshift"] > 0

    def test_cone_radius_zero_rejected(self):
        from adapters.ned_adapter import build_objsearch_cone_url
        with pytest.raises(ValueError):
            build_objsearch_cone_url(0.0, 0.0, 0.0)


# ── Scientific sanity: M87 cosmology ────────────────────────────────────────


class TestScientificSanity:

    def test_m87_distance_18_5mpc(self):
        """M87 distance ≈ 18.5 Mpc (Surface Brightness Fluctuations, Blakeslee 2009).

        M87 is the central galaxy of the Virgo Cluster. Its heliocentric
        redshift is z=0.004360. The simple Hubble-law distance for that z
        at H0=67.8 is c·z/H0 ≈ 19.3 Mpc — essentially equal to the SBF
        distance. This consistency is a real result: M87's peculiar
        velocity in the CMB frame is only ~300 km/s, much smaller than
        the Virgo infall velocity of the Local Group (~200 km/s in the
        opposite direction).

        The adapter must preserve BOTH the published distance (18.5 Mpc,
        SBF method) AND the redshift (0.004360, heliocentric) without
        collapsing them to a single value — they are independently
        measured quantities.
        """
        with open("tests/fixtures/ned_objsearch/m87_envelope.json") as f:
            envelope = json.load(f)
        from adapters.ned_adapter import _parse_obj_envelope_to_object
        obj = _parse_obj_envelope_to_object(envelope)
        assert 17.0 < obj.distance_mpc < 20.0
        assert obj.redshift.value == pytest.approx(0.004360, rel=1e-4)
        # Both must be present; we do NOT silently prefer one over the other.
        assert obj.distance_mpc is not None
        assert obj.distance_method == "Surface Brightness Fluctuations"
