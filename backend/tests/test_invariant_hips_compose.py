"""Phase 10 - Multi-wavelength HiPS composition invariants.

Lock the scientific contract:
  * 6 SPHEREx LVF bands per release (qr2, qr3)
  * Bands sorted by central wavelength
  * Pixel scale = fov_deg * 3600 / width_px
  * Coords and FOV bounds enforced
  * No synthetic bands
"""
from __future__ import annotations

import math
import pytest


class TestWavelengthMapping:

    def test_six_bands_per_release(self):
        from adapters.hips_compose import SPHEREX_BAND_CENTRAL_WAVELENGTHS_MICRONS
        assert len(SPHEREX_BAND_CENTRAL_WAVELENGTHS_MICRONS) == 6

    def test_band_central_wavelengths_monotonic(self):
        from adapters.hips_compose import SPHEREX_BAND_CENTRAL_WAVELENGTHS_MICRONS
        wavelengths = [SPHEREX_BAND_CENTRAL_WAVELENGTHS_MICRONS[i]
                       for i in range(1, 7)]
        for i in range(1, len(wavelengths)):
            assert wavelengths[i] > wavelengths[i - 1]

    def test_band_central_wavelengths_in_spherespec_range(self):
        """SPHEREx LVF covers 0.75 - 4.1 microns. All band centres
        must be within this range (band 1 centre ~0.875, band 6 centre ~3.6)."""
        from adapters.hips_compose import SPHEREX_BAND_CENTRAL_WAVELENGTHS_MICRONS
        for i, wl in SPHEREX_BAND_CENTRAL_WAVELENGTHS_MICRONS.items():
            assert 0.75 <= wl <= 4.1, f"Band {i} centre {wl} outside SPHEREx LVF range"


class TestCompositionBounds:

    def test_invalid_ra_rejected(self):
        from adapters.hips_compose import compose_sed_at_position, HiPSCompositionError
        with pytest.raises(HiPSCompositionError):
            compose_sed_at_position(ra_deg=400.0, dec_deg=0.0)

    def test_invalid_dec_rejected(self):
        from adapters.hips_compose import compose_sed_at_position, HiPSCompositionError
        with pytest.raises(HiPSCompositionError):
            compose_sed_at_position(ra_deg=0.0, dec_deg=-91.0)

    def test_negative_fov_rejected(self):
        from adapters.hips_compose import compose_sed_at_position, HiPSCompositionError
        with pytest.raises(HiPSCompositionError):
            compose_sed_at_position(ra_deg=0.0, dec_deg=0.0, fov_deg=-0.1)

    def test_oversized_fov_rejected(self):
        from adapters.hips_compose import compose_sed_at_position, HiPSCompositionError
        with pytest.raises(HiPSCompositionError):
            compose_sed_at_position(ra_deg=0.0, dec_deg=0.0, fov_deg=2.0)

    def test_too_small_width_rejected(self):
        from adapters.hips_compose import compose_sed_at_position, HiPSCompositionError
        with pytest.raises(HiPSCompositionError):
            compose_sed_at_position(ra_deg=0.0, dec_deg=0.0, width_px=10)

    def test_too_large_width_rejected(self):
        from adapters.hips_compose import compose_sed_at_position, HiPSCompositionError
        with pytest.raises(HiPSCompositionError):
            compose_sed_at_position(ra_deg=0.0, dec_deg=0.0, width_px=5000)


class TestCompositionOutput:

    def test_qr3_returns_6_spherex_bands_plus_context(self):
        from adapters.hips_compose import compose_sed_at_position
        stack = compose_sed_at_position(
            ra_deg=10.0, dec_deg=20.0, fov_deg=0.05,
            spherex_release="qr3", include_context=True,
        )
        spherex_bands = [b for b in stack.bands if b.category == "spherex"]
        assert len(spherex_bands) == 6
        context_bands = [b for b in stack.bands if b.category == "context"]
        assert len(context_bands) >= 3  # DSS2 + 2MASS + WISE

    def test_qr2_returns_6_spherex_bands(self):
        from adapters.hips_compose import compose_sed_at_position
        stack = compose_sed_at_position(
            ra_deg=10.0, dec_deg=20.0, fov_deg=0.05,
            spherex_release="qr2", include_context=False,
        )
        assert len(stack.bands) == 6
        assert all(b.category == "spherex" for b in stack.bands)
        assert all(b.hips_release == "qr2" for b in stack.bands)

    def test_bands_sorted_by_wavelength(self):
        from adapters.hips_compose import compose_sed_at_position
        stack = compose_sed_at_position(
            ra_deg=10.0, dec_deg=20.0, fov_deg=0.05,
            spherex_release="qr3", include_context=True,
        )
        wl_list = [b.central_wavelength_um for b in stack.bands]
        assert wl_list == sorted(wl_list)

    def test_pixel_scale_correct(self):
        from adapters.hips_compose import compose_sed_at_position
        stack = compose_sed_at_position(
            ra_deg=10.0, dec_deg=20.0, fov_deg=0.1, width_px=400, height_px=400,
            spherex_release="qr3", include_context=False,
        )
        # 0.1 deg = 360 arcsec, 400 px => 0.9 arcsec/pixel
        assert abs(stack.pixel_scale_arcsec - 0.9) < 1e-9

    def test_all_bands_share_fov(self):
        from adapters.hips_compose import compose_sed_at_position
        stack = compose_sed_at_position(
            ra_deg=10.0, dec_deg=20.0, fov_deg=0.02, width_px=200,
            spherex_release="qr3", include_context=True,
        )
        assert all(b.fov_deg == 0.02 for b in stack.bands)
        assert all(b.width_px == 200 for b in stack.bands)


class TestCompositionDeduplication:

    def test_unique_hips_ids(self):
        from adapters.hips_compose import compose_sed_at_position
        stack = compose_sed_at_position(
            ra_deg=10.0, dec_deg=20.0, spherex_release="qr3", include_context=True,
        )
        ids = [b.hips_id for b in stack.bands]
        assert len(ids) == len(set(ids)), f"Duplicate HiPS IDs: {ids}"


class TestScientificSanity:

    def test_pixel_scale_at_1_arcsec(self):
        """Standard HiPS tile at order 11 is ~0.5''/px; here we just verify
        the formula is internally consistent for a 1 arcsec/px target scale."""
        from adapters.hips_compose import compose_sed_at_position
        # 3600 arcsec / 3600 px = 1 arcsec/px
        stack = compose_sed_at_position(
            ra_deg=0.0, dec_deg=0.0, fov_deg=1.0, width_px=3600, height_px=3600,
            spherex_release="qr3", include_context=False,
        )
        assert abs(stack.pixel_scale_arcsec - 1.0) < 1e-9
        assert all(abs(b.pixel_scale_arcsec - 1.0) < 1e-9 for b in stack.bands)
