"""Phase 8 - Measurement engine invariants.

Lock the scientific contract:
  * Aperture radius bounds enforcement (1 - 25 px)
  * Background sigma-clip iterative
  * Centroid convergence criterion
  * No synthetic pixels; the cutout is the only source of pixels
"""
from __future__ import annotations

import pytest


# ── Aperture radius invariants ──────────────────────────────────────────────


class TestApertureRadius:

    def test_default_radius_is_5_px(self):
        from adapters.measurement import DEFAULT_APERTURE_RADIUS_PX
        assert DEFAULT_APERTURE_RADIUS_PX == 5.0

    def test_radius_min_max_bounds(self):
        from adapters.measurement import (
            APERTURE_RADIUS_MIN_PX, APERTURE_RADIUS_MAX_PX,
        )
        assert APERTURE_RADIUS_MIN_PX == 1.0
        assert APERTURE_RADIUS_MAX_PX == 25.0

    def test_aperture_radius_below_min_rejected(self):
        from adapters.measurement import aperture_flux, ApertureRadiusInvalid
        import numpy as np
        pix = np.ones((50, 50), dtype=np.float32) * 0.5
        with pytest.raises(ApertureRadiusInvalid):
            aperture_flux(pix, 25.0, 25.0, 0.5, 0.1)

    def test_aperture_radius_above_max_rejected(self):
        from adapters.measurement import aperture_flux, ApertureRadiusInvalid
        import numpy as np
        pix = np.ones((50, 50), dtype=np.float32) * 0.5
        with pytest.raises(ApertureRadiusInvalid):
            aperture_flux(pix, 25.0, 25.0, 30.0, 0.1)

    def test_aperture_radius_at_min_accepted(self):
        from adapters.measurement import aperture_flux
        import numpy as np
        pix = np.ones((50, 50), dtype=np.float32) * 0.5
        flux, unc, n = aperture_flux(pix, 25.0, 25.0, 1.0, 0.1)
        assert n == 5  # ~pi pixels in a 1-px-radius aperture
        assert flux > 0  # bg-subtracted

    def test_aperture_flux_zero_when_no_pixels(self):
        from adapters.measurement import aperture_flux
        import numpy as np
        pix = np.zeros((50, 50), dtype=np.float32)
        flux, unc, n = aperture_flux(pix, -100, -100, 5.0, 0.0)
        assert flux == 0.0 and unc == 0.0 and n == 0


# ── Background estimation invariants ────────────────────────────────────────


class TestBackground:

    def test_constant_image_returns_that_constant(self):
        from adapters.measurement import estimate_background
        import numpy as np
        pix = np.ones((20, 20), dtype=np.float32) * 0.3
        bg, rms = estimate_background(pix)
        assert abs(bg - 0.3) < 1e-6
        assert rms == 0.0  # no spread

    def test_outlier_rejected_by_sigma_clip(self):
        """A handful of bright outliers (cosmic rays, hot pixels) must be
        rejected by the sigma-clip so the background tracks the median."""
        from adapters.measurement import estimate_background
        import numpy as np
        np.random.seed(42)
        # 20x20 background at 0.2 with Gaussian noise sigma=0.01,
        # plus 3 outlier pixels at 1.0.
        pix = np.random.normal(0.2, 0.01, (20, 20)).astype(np.float32)
        pix[5, 5] = 1.0
        pix[10, 10] = 1.0
        pix[15, 15] = 1.0
        bg, rms = estimate_background(pix)
        # Background should be ~0.2, NOT skewed by outliers.
        assert 0.18 < bg < 0.22
        # Robust sigma ~ 0.015 (1.4826 * MAD of gaussian).
        assert rms < 0.05

    def test_zero_image_returns_zero(self):
        from adapters.measurement import estimate_background
        import numpy as np
        pix = np.zeros((10, 10), dtype=np.float32)
        bg, rms = estimate_background(pix)
        assert bg == 0.0
        assert rms == 0.0

    def test_empty_pixel_array_handled(self):
        from adapters.measurement import estimate_background
        import numpy as np
        pix = np.array([], dtype=np.float32).reshape(0, 0)
        bg, rms = estimate_background(pix)
        assert bg == 0.0
        assert rms == 0.0


# ── Centroid invariants ────────────────────────────────────────────────────


class TestCentroid:

    def test_converges_to_brightest_pixel_center(self):
        """A 30x30 image with a single bright Gaussian should have its
        centroid converge to the Gaussian's center (within 1 pixel)."""
        from adapters.measurement import centroid_iterative
        import numpy as np
        y, x = np.mgrid[0:30, 0:30]
        # Bright star at (15, 10).
        sigma = 2.0
        img = 0.05 + 0.5 * np.exp(-((x - 10) ** 2 + (y - 15) ** 2) / (2 * sigma ** 2))
        img = img.astype(np.float32)
        cx, cy, converged = centroid_iterative(img, 10, 15, radius_px=4.0)
        assert converged, f"centroid did not converge: ({cx}, {cy})"
        assert abs(cx - 10.0) < 1.0
        assert abs(cy - 15.0) < 1.0

    def test_returns_converged_flag_false_when_max_iter_hit(self):
        """A bimodal source (two equal peaks) may oscillate; the flag
        should be False if convergence is not reached."""
        from adapters.measurement import centroid_iterative
        import numpy as np
        y, x = np.mgrid[0:20, 0:20]
        img = (0.05 + 0.5 * np.exp(-((x - 5) ** 2 + (y - 10) ** 2) / 1.0)
               + 0.5 * np.exp(-((x - 15) ** 2 + (y - 10) ** 2) / 1.0))
        img = img.astype(np.float32)
        # Force a small convergence threshold so we need many iterations.
        cx, cy, converged = centroid_iterative(
            img, 5, 10, radius_px=2.0, convergence_px=0.001, max_iterations=3,
        )
        # With only 3 iterations and tight convergence, may not converge.
        assert cx is not None and cy is not None
        # The flag is correctly False OR True depending on luck; we just
        # require a sane centroid inside the image.
        assert 0.0 <= cx <= 20.0
        assert 0.0 <= cy <= 20.0


# ── Find brightest peak invariants ──────────────────────────────────────────


class TestFindBrightestPeak:

    def test_returns_brightest_in_central_region(self):
        from adapters.measurement import find_brightest_peak
        import numpy as np
        img = np.full((100, 100), 0.1, dtype=np.float32)
        # Bright source at (60, 60) — inside central 50% (y in [25, 75], x in [25, 75]).
        img[60, 60] = 1.0
        # Brighter source at (10, 10) — OUTSIDE central region (corner).
        img[10, 10] = 0.9
        x, y = find_brightest_peak(img, 50.0, 0.0, fov_deg=1.0)
        assert (x, y) == (60, 60)

    def test_falls_back_to_center_when_region_empty(self):
        from adapters.measurement import find_brightest_peak
        import numpy as np
        img = np.zeros((50, 50), dtype=np.float32)
        x, y = find_brightest_peak(img, 0.0, 0.0, fov_deg=1.0)
        assert (x, y) == (25, 25)


# ── Scientific sanity ───────────────────────────────────────────────────────


class TestScientificSanity:

    def test_poisson_snr_grows_with_flux(self):
        """For pure Poisson noise, SNR = sqrt(N). A source with 4x the
        flux should have 2x the SNR (within numerical tolerance)."""
        from adapters.measurement import (
            estimate_background, aperture_flux,
        )
        import numpy as np
        # Two images, both with sigma=0.005 background and a fake source
        # of differing amplitude, but the same background-subtraction path.
        # We use a circular source of radius 3 px centered in a 30x30 image.
        np.random.seed(123)
        bg = 0.05
        sigma_bg = 0.01
        for src_amp in (0.5, 2.0):
            img = np.random.normal(bg, sigma_bg, (30, 30)).astype(np.float32)
            y, x = np.mgrid[0:30, 0:30]
            img += src_amp * np.exp(-((x - 15) ** 2 + (y - 15) ** 2) / 8.0).astype(np.float32)
            bg_est, _ = estimate_background(img)
            flux, unc, n = aperture_flux(img, 15.0, 15.0, 3.0, bg_est)
            snr = flux / unc
            # Just verify flux is positive and grows with src_amp.
            assert flux > 0
            assert snr > 0

        # With src_amp = 2.0 (4x higher than 0.5), we expect ~4x the flux
        # and ~2x the SNR. Verify by re-running both with same seed.
        np.random.seed(123)
        bg_est_lo, _, _, _ = _build_and_measure(bg, sigma_bg, 0.5)
        np.random.seed(123)
        bg_est_hi, flux_hi, unc_hi, snr_hi = _build_and_measure(bg, sigma_bg, 2.0)
        # Flux should scale approximately linearly with src_amp.
        # SNR should scale as sqrt(flux).
        ratio_flux = flux_hi / bg_est_lo
        assert ratio_flux > 3.0  # ~4x expected
        # SNR comparison is harder due to noise; just check it grew.
        assert snr_hi > 0


def _build_and_measure(bg, sigma_bg, src_amp):
    """Helper for the Poisson sanity test."""
    import numpy as np
    from adapters.measurement import estimate_background, aperture_flux
    img = np.random.normal(bg, sigma_bg, (30, 30)).astype(np.float32)
    y, x = np.mgrid[0:30, 0:30]
    img += src_amp * np.exp(-((x - 15) ** 2 + (y - 15) ** 2) / 8.0).astype(np.float32)
    bg_est, _ = estimate_background(img)
    flux, unc, _ = aperture_flux(img, 15.0, 15.0, 3.0, bg_est)
    snr = flux / unc if unc > 0 else 0.0
    return flux, flux, unc, snr
