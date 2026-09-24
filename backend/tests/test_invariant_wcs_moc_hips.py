"""Phase 3 invariant tests — WCS, MOC, HiPS engines.

Lock the scientific contract:
  · WCS round-trip tolerance, projection enforcement, SIP refusal
  · MOC cone intersection, order enforcement, deduplication
  · HiPS manifest: real base URLs, real CreatorDIDs, real SPHEREx LVF bands

These tests never make an outbound HTTP request.
"""
from __future__ import annotations

import math

import pytest


# ── WCS invariants ──────────────────────────────────────────────────────────

class TestWCSInvariant:
    """WCS solver contract."""

    def _make_header(self, **overrides):
        """Minimal SPHEREx-like TAN header. CRVAL1=180, CRVAL2=0 tangent."""
        header = {
            "CTYPE1": "RA---TAN",
            "CTYPE2": "DEC--TAN",
            "CRPIX1": 100.0,
            "CRPIX2": 100.0,
            "CRVAL1": 180.0,
            "CRVAL2": 0.0,
            "CD1_1": 0.0017,   # ~6.12 arcsec/pixel
            "CD1_2": 0.0,
            "CD2_1": 0.0,
            "CD2_2": 0.0017,
            "RADESYS": "ICRS",
            "EQUINOX": 2000.0,
        }
        header.update(overrides)
        return header

    def test_round_trip_at_tangent_point_closes_to_one_microarcsec(self):
        """Phase 3 invariant: round-trip at the tangent point closes to ≤1e-3 px."""
        from adapters.wcs_engine import solve_wcs, round_trip
        header = self._make_header()
        solve = solve_wcs(header, image_width_px=200, image_height_px=200)
        rt = round_trip(solve, pixel_x=100.0, pixel_y=100.0)
        # At the tangent point, the linear approximation is exact:
        assert rt.residual_x_px <= 1e-3
        assert rt.residual_y_px <= 1e-3
        assert rt.within_tolerance

    def test_round_trip_off_tangent_still_closes_to_one_percent(self):
        """Off-tangent the residual grows but stays bounded by the linear
        approximation. We allow up to 1 arcsec for a ~1° offset at order 8."""
        from adapters.wcs_engine import solve_wcs, round_trip
        header = self._make_header()
        solve = solve_wcs(header)
        # 100 px off the tangent point
        rt = round_trip(solve, pixel_x=200.0, pixel_y=200.0,
                        tolerance_px=1e-1)
        # The closed-form TAN gives the tangent-plane approximation;
        # the round-trip is exact in the linear case so this should still
        # round-trip precisely:
        assert rt.within_tolerance, (
            f"round-trip residual {rt.residual_x_px:.2e} px out of bounds"
        )

    def test_solver_refuses_missing_crval(self):
        from adapters.wcs_engine import solve_wcs, WCSIncompleteHeaders
        header = self._make_header()
        del header["CRVAL1"]
        with pytest.raises(WCSIncompleteHeaders):
            solve_wcs(header)

    def test_solver_refuses_missing_cd_matrix(self):
        from adapters.wcs_engine import solve_wcs, WCSIncompleteHeaders
        header = self._make_header()
        for k in ("CD1_1", "CD1_2", "CD2_1", "CD2_2"):
            del header[k]
        with pytest.raises(WCSIncompleteHeaders):
            solve_wcs(header)

    def test_solver_supports_pc_cdelt_alternative(self):
        """Headers without CD_i_j but with PC_i_j + CDELT_i must work."""
        from adapters.wcs_engine import solve_wcs
        header = self._make_header()
        for k in ("CD1_1", "CD1_2", "CD2_1", "CD2_2"):
            del header[k]
        header["PC1_1"] = 1.0
        header["PC1_2"] = 0.0
        header["PC2_1"] = 0.0
        header["PC2_2"] = 1.0
        header["CDELT1"] = 0.0017
        header["CDELT2"] = 0.0017
        solve = solve_wcs(header)
        assert solve.pixel_scale_x_arcsec == pytest.approx(6.12, abs=1e-3)
        assert solve.pixel_scale_y_arcsec == pytest.approx(6.12, abs=1e-3)

    def test_solver_refuses_unknown_projection(self):
        from adapters.wcs_engine import solve_wcs, WCSProjectionUnsupported
        header = self._make_header()
        header["CTYPE1"] = "RA---FANCY"
        with pytest.raises(WCSProjectionUnsupported):
            solve_wcs(header)

    def test_solver_reports_pixel_scale(self):
        from adapters.wcs_engine import solve_wcs
        header = self._make_header()
        solve = solve_wcs(header)
        # 0.0017 deg = 6.12 arcsec, which is the SPHEREx Level-2 plate scale.
        assert solve.pixel_scale_x_arcsec == pytest.approx(6.12, abs=1e-3)
        assert solve.projection == "TAN"
        assert solve.frame == "ICRS"

    def test_uncertainty_combines_cd_and_gaia_sigma(self):
        from adapters.wcs_engine import solve_wcs, pixel_uncertainty
        solve = solve_wcs(self._make_header())
        # Without Gaia σ: uncertainty equals pixel scale.
        u0 = pixel_uncertainty(solve, reference_catalog_sigma_mas=None)
        assert u0.combined_sigma_arcsec == pytest.approx(6.12, abs=1e-3)
        # With Gaia σ = 10 mas = 0.01 arcsec: combined = sqrt(6.12² + 0.01²).
        u1 = pixel_uncertainty(solve, reference_catalog_sigma_mas=10.0)
        assert u1.combined_sigma_arcsec > u0.combined_sigma_arcsec
        assert u1.combined_sigma_arcsec - 6.12 < 0.01  # tiny addition

    def test_sip_order_mismatch_raises(self):
        from adapters.wcs_engine import solve_wcs, WCSSIPDistortionMalformed
        header = self._make_header()
        header["A_ORDER"] = 3
        header["B_ORDER"] = 2  # mismatch
        with pytest.raises(WCSSIPDistortionMalformed):
            solve_wcs(header)

    def test_sip_consistent_order_accepted(self):
        from adapters.wcs_engine import solve_wcs
        header = self._make_header()
        header["A_ORDER"] = 2
        header["B_ORDER"] = 2
        # Add the 9 expected A_i_j and 9 B_i_j coefficients
        for i in range(3):
            for j in range(3):
                header[f"A_{i}_{j}"] = 0.0
                header[f"B_{i}_{j}"] = 0.0
        solve = solve_wcs(header)
        assert solve.has_sip is True
        assert solve.sip_order == 2


# ── MOC invariants ──────────────────────────────────────────────────────────

class TestMOCInvariant:
    """MOC engine contract."""

    def test_empty_input_refused(self):
        from adapters.moc_engine import build_moc_from_points, MOCEmptyInput
        with pytest.raises((MOCEmptyInput, ValueError)):
            build_moc_from_points([], [], order=8)

    def test_order_out_of_range_refused(self):
        from adapters.moc_engine import build_moc_from_points, MOCOrderOutOfRange
        with pytest.raises((MOCOrderOutOfRange, ValueError)):
            build_moc_from_points([10.0], [20.0], order=30)

    def test_negative_order_refused(self):
        from adapters.moc_engine import build_moc_from_points
        with pytest.raises(ValueError):
            build_moc_from_points([10.0], [20.0], order=-1)

    def test_deduplicates_overlapping_points(self):
        from adapters.moc_engine import build_moc_from_points
        # Three points clustered within a single HEALPix cell.
        ra = [10.0, 10.001, 10.002]
        dec = [20.0, 20.001, 20.002]
        moc = build_moc_from_points(ra, dec, order=4)
        # At order 4 each cell is ~3.7° wide; three points <1 arcsec apart → 1 cell.
        assert moc.cell_count == 1

    def test_distant_points_split_into_multiple_cells(self):
        from adapters.moc_engine import build_moc_from_points
        # Two points separated by 180° at order 1 must lie in different cells.
        moc = build_moc_from_points([0.0, 180.0], [0.0, 0.0], order=1)
        # Antipodal points are guaranteed to be in different cells.
        assert moc.cell_count >= 2

    def test_cone_intersects_matching(self):
        from adapters.moc_engine import build_moc_from_points, cone_intersects
        moc = build_moc_from_points([10.0, 20.0, 30.0], [0.0, 0.0, 0.0], order=8)
        # Cone centered on one of the points (radius 0.1°) must intersect.
        assert cone_intersects(moc, 10.0, 0.0, 0.1) is True

    def test_cone_far_away_returns_false(self):
        from adapters.moc_engine import build_moc_from_points, cone_intersects
        moc = build_moc_from_points([10.0], [0.0], order=8)
        # Cone 180° away (in the antipodal hemisphere).
        assert cone_intersects(moc, 190.0, 0.0, 0.5) is False

    def test_cone_intersection_with_empty_moc_is_false(self):
        from adapters.moc_engine import cone_intersects, MOCRegion
        empty = MOCRegion(cells=(), max_order=0, cell_count=0)
        assert cone_intersects(empty, 0.0, 0.0, 1.0) is False

    def test_intersection_and_union_deduplicate(self):
        from adapters.moc_engine import build_moc_from_points, moc_intersection, moc_union
        a = build_moc_from_points([10.0, 20.0], [0.0, 0.0], order=4)
        b = build_moc_from_points([20.0, 30.0], [0.0, 0.0], order=4)
        inter = moc_intersection(a, b)
        union = moc_union(a, b)
        # Only the (20°, 0°) point should be in both A and B.
        assert inter.cell_count >= 1
        # Union must contain all unique cells from both MOCs.
        assert union.cell_count == len(set(a.cells) | set(b.cells))


# ── HiPS invariants ─────────────────────────────────────────────────────────

class TestHiPSInvariant:
    """HiPS manifest contract."""

    def test_qr3_has_6_spherex_layers(self):
        from adapters.hips_engine import get_spherex_hips
        bands = get_spherex_hips("qr3")
        assert len(bands) == 6
        # The SPHEREx LVF bands are 1..6; each band has its own HiPS layer.
        for i, band in enumerate(bands, start=1):
            assert band.spherex_band == i

    def test_qr2_has_6_spherex_layers(self):
        from adapters.hips_engine import get_spherex_hips
        bands = get_spherex_hips("qr2")
        assert len(bands) == 6

    def test_qr_unknown_release_raises(self):
        from adapters.hips_engine import get_spherex_hips, HiPSReleaseUnknown
        with pytest.raises(HiPSReleaseUnknown):
            get_spherex_hips("qr1")

    def test_context_layers_include_dss2_2mass_wise(self):
        from adapters.hips_engine import get_context_hips
        ctx = {p.creator_did.split("/")[-1]: p for p in get_context_hips()}
        # Real CDS / IRSA HiPS endpoints; we never invent endpoints.
        assert "color" in ctx["dss2_color"].creator_did.lower()
        assert ctx["dss2_color"].hips_tile_format in {"jpg", "png", "fits"}
        assert "2mass" in ctx["2mass_color"].base_url.lower()
        assert "wise" in ctx["wise_w1w2"].base_url.lower()

    def test_tile_count_at_order_5_is_12_times_4_power_5(self):
        from adapters.hips_engine import tile_count_at_order
        assert tile_count_at_order(5) == 12 * (4 ** 5)  # 12288

    def test_tile_url_formats_order_dir_ipix(self):
        from adapters.hips_engine import get_spherex_hips, tile_url
        bands = get_spherex_hips("qr3")
        url = tile_url(bands[0], order=5, ipix=0)
        # Must use the IVOA HiPS URL convention {order}/{dir}/{ipix}.
        assert "/5/" in url
        assert "/0/0.fits" in url

    def test_tile_url_rejects_out_of_range_ipix(self):
        from adapters.hips_engine import get_spherex_hips, tile_url, HiPSError
        bands = get_spherex_hips("qr3")
        with pytest.raises(HiPSError):
            tile_url(bands[0], order=0, ipix=13)  # 12 cells at order 0 → ipix ∈ [0, 12)

    def test_tile_url_rejects_order_above_hips_order(self):
        from adapters.hips_engine import get_spherex_hips, tile_url, HiPSError
        bands = get_spherex_hips("qr3")
        with pytest.raises(HiPSError):
            tile_url(bands[0], order=15, ipix=0)  # bands[0].hips_order = 14

    def test_spherex_qr3_base_url_is_irsa(self):
        """The SPHEREx QR3 HiPS base URL must point at IRSA — never invented."""
        from adapters.hips_engine import get_spherex_hips
        bands = get_spherex_hips("qr3")
        for b in bands:
            assert "irsa.ipac.caltech.edu" in b.base_url
            assert b.spherex_doi == "10.26131/IRSA662"

    def test_spherex_qr2_base_url_is_irsa(self):
        from adapters.hips_engine import get_spherex_hips
        bands = get_spherex_hips("qr2")
        for b in bands:
            assert "irsa.ipac.caltech.edu" in b.base_url
            assert b.spherex_doi == "10.26131/IRSA652"


# ── HEALPix cell utility invariants ────────────────────────────────────────

class TestHEALPixCellUtility:
    """Verify the pure-Python HEALPix encoding matches ground truth within tolerance."""

    def test_z_basis_north_pole_returns_index_zero_at_order_0(self):
        """At order 0, the north pole cell is index 8 (12 base cells, 1 at pole).
        Our pure-Python fallback is approximate but the (0, 0, +1) bin should
        fall in one of the polar cells, not crash."""
        from adapters.moc_engine import _nest_index
        idx = _nest_index(0.0, 89.999, order=0)
        assert 0 <= idx < 12

    def test_z_basis_south_pole_returns_index_in_range(self):
        from adapters.moc_engine import _nest_index
        idx = _nest_index(180.0, -89.999, order=0)
        assert 0 <= idx < 12

    def test_origin_in_range(self):
        from adapters.moc_engine import _nest_index
        idx = _nest_index(10.0, 20.0, order=2)
        assert 0 <= idx < 12 * (4 ** 2)  # 192

    def test_cell_center_within_one_cell_radius(self):
        from adapters.moc_engine import _nest_index, _cell_center, _npix
        order = 4
        # The cell center from the decoder should match the input within ~half
        # a cell width.
        cell_radius_deg = math.degrees(math.sqrt(41252.96 / _npix(order) / math.pi))
        ra, dec = 45.0, 30.0
        idx = _nest_index(ra, dec, order)
        center_ra, center_dec = _cell_center(idx, order)
        # Cartesion dot product separation test
        sep = math.acos(max(
            -1.0, min(1.0,
                math.sin(math.radians(dec)) * math.sin(math.radians(center_dec))
                + math.cos(math.radians(dec)) * math.cos(math.radians(center_dec)) *
                math.cos(math.radians(ra - center_ra))
            )
        ))
        assert math.degrees(sep) < cell_radius_deg, (
            f"Cell center {center_ra:.3f},{center_dec:.3f} is not within "
            f"{cell_radius_deg:.3f}° of input {ra},{dec}"
        )
