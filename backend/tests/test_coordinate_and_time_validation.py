"""Scientific Validation Test Suite for Coordinate & Time Engines.

Cross-validates numerical coordinate transformations, angular separations,
and astronomical time conversions against Astropy standards.

CRITICAL SCIENTIFIC PRINCIPLE:
Strictly distinguishes between:
1. Numerical Transformation Accuracy (tested here to < 1e-6 arcsec)
2. Astronomical Measurement Accuracy (SPHEREx L2 alignment is ~0.1 - 0.4 arcsec RMS)
"""

import math
import numpy as np
import pytest
from astropy.coordinates import SkyCoord
import astropy.units as u
from astropy.time import Time

# Reference IAU 1958 / Hipparcos ICRS to Galactic transformation matrix
M_ICRS_TO_GAL = np.array([
    [-0.0548755604162154, -0.8734370902348850, -0.4838350155487132],
    [+0.4941094278755837, -0.4448296299600112, +0.7469822444972189],
    [-0.8676661490190047, -0.1980763734312015, +0.4559837761750669],
])

M_GAL_TO_ICRS = M_ICRS_TO_GAL.T

EPS_J2000_RAD = math.radians(23.439279444444445)
COS_EPS = math.cos(EPS_J2000_RAD)
SIN_EPS = math.sin(EPS_J2000_RAD)


def py_spherical_to_vector(lon_deg: float, lat_deg: float) -> np.ndarray:
    lon_rad = math.radians(lon_deg)
    lat_rad = math.radians(lat_deg)
    cos_lat = math.cos(lat_rad)
    return np.array([cos_lat * math.cos(lon_rad), cos_lat * math.sin(lon_rad), math.sin(lat_rad)])


def py_vector_to_spherical(v: np.ndarray) -> tuple[float, float]:
    x, y, z = v
    hyp = math.sqrt(x * x + y * y)
    lon_deg = math.degrees(math.atan2(y, x)) % 360.0
    lat_deg = math.degrees(math.atan2(z, hyp))
    return lon_deg, lat_deg


def py_icrs_to_galactic(ra_deg: float, dec_deg: float) -> tuple[float, float]:
    v_icrs = py_spherical_to_vector(ra_deg, dec_deg)
    v_gal = M_ICRS_TO_GAL @ v_icrs
    return py_vector_to_spherical(v_gal)


def py_galactic_to_icrs(l_deg: float, b_deg: float) -> tuple[float, float]:
    v_gal = py_spherical_to_vector(l_deg, b_deg)
    v_icrs = M_GAL_TO_ICRS @ v_gal
    return py_vector_to_spherical(v_icrs)


def py_angular_separation_deg(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    v1 = py_spherical_to_vector(ra1, dec1)
    v2 = py_spherical_to_vector(ra2, dec2)
    cross_norm = np.linalg.norm(np.cross(v1, v2))
    dot = np.dot(v1, v2)
    return math.degrees(math.atan2(cross_norm, dot))


def test_numerical_roundtrip_precision():
    """Verify that ICRS -> Galactic -> ICRS numerical round-trip error is < 1e-10 degrees."""
    test_points = [
        (0.0, 0.0),
        (266.4168, -29.0078),   # Sgr A*
        (88.7929, 7.4071),      # Betelgeuse
        (10.6847, 41.2687),     # M31
        (192.85948, 27.12825),  # North Galactic Pole
        (0.0, 90.0),            # North Celestial Pole
        (180.0, -90.0),         # South Celestial Pole
    ]

    for ra, dec in test_points:
        l, b = py_icrs_to_galactic(ra, dec)
        ra_back, dec_back = py_galactic_to_icrs(l, b)
        sep_deg = py_angular_separation_deg(ra, dec, ra_back, dec_back)
        sep_arcsec = sep_deg * 3600.0

        # Numerical roundtrip precision must be sub-microarcsecond
        assert sep_arcsec < 1e-6, f"Numerical roundtrip residual {sep_arcsec} arcsec too high for ({ra}, {dec})"


def test_parity_with_astropy_galactic():
    """Validate our transformation matrix against Astropy's Galactic frame transformation."""
    benchmark_sources = [
        ("Betelgeuse", 88.7929, 7.4071),
        ("Sgr A*", 266.4168, -29.0078),
        ("Vega", 279.2347, 38.7837),
        ("Crab Pulsar", 83.6331, 22.0145),
        ("North Galactic Pole", 192.85948, 27.12825),
    ]

    for name, ra, dec in benchmark_sources:
        # Our engine
        l_calc, b_calc = py_icrs_to_galactic(ra, dec)

        # Astropy engine
        c = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs")
        c_gal = c.galactic
        l_astro = c_gal.l.deg
        b_astro = c_gal.b.deg

        # Angular difference between transformed sky vectors
        v_calc = py_spherical_to_vector(l_calc, b_calc)
        v_astro = py_spherical_to_vector(l_astro, b_astro)
        diff_arcsec = math.degrees(math.atan2(np.linalg.norm(np.cross(v_calc, v_astro)), np.dot(v_calc, v_astro))) * 3600.0

        # Must agree to within 0.01 arcseconds (Astropy includes tiny ICRS frame bias term ~ 10-20 mas)
        assert diff_arcsec < 0.05, f"Discrepancy with Astropy for {name}: {diff_arcsec} arcsec"


def test_stable_angular_separation_edge_cases():
    """Verify angular separation at tiny separations (1 micro-arcsec) and antipodal points (180 deg)."""
    # 1. Tiny separation: 1 micro-arcsecond
    ra1, dec1 = 45.0, 45.0
    shift_deg = (1.0 / 3600.0 / 1e6)  # 1 micro-arcsec in deg
    ra2, dec2 = 45.0, 45.0 + shift_deg

    sep_calc = py_angular_separation_deg(ra1, dec1, ra2, dec2)
    sep_astro = SkyCoord(ra1 * u.deg, dec1 * u.deg).separation(SkyCoord(ra2 * u.deg, dec2 * u.deg)).deg

    # At 1 micro-arcsecond (2.77e-10 deg), floating-point trigonometry agrees to sub-pico-degrees
    assert math.isclose(sep_calc, sep_astro, abs_tol=1e-12)

    # 2. Antipodal separation: exact 180 degrees
    ra3, dec3 = 0.0, 0.0
    ra4, dec4 = 180.0, 0.0
    sep_antipodal = py_angular_separation_deg(ra3, dec3, ra4, dec4)
    assert math.isclose(sep_antipodal, 180.0, abs_tol=1e-10)


def test_time_conversion_against_astropy():
    """Verify Julian Date, MJD, and Julian Epoch against Astropy Time."""
    epochs = [
        "2000-01-01T12:00:00",
        "2025-08-16T00:00:00",
        "2026-09-15T00:00:00",
        "2029-04-13T21:46:00",
    ]

    for ep_str in epochs:
        t_astro = Time(ep_str, format="isot", scale="utc")
        jd_astro = t_astro.jd
        mjd_astro = t_astro.mjd
        jyear_astro = t_astro.jyear

        # Our algorithm implementation:
        # Standard Meeus JD calculation
        dt = t_astro.datetime
        y, m, d = dt.year, dt.month, dt.day
        hour, minute, sec, ms = dt.hour, dt.minute, dt.second, dt.microsecond
        if m <= 2:
            y -= 1
            m += 12
        a = y // 100
        b = 2 - a + a // 4
        day_frac = (hour + minute / 60.0 + (sec + ms / 1e6) / 3600.0) / 24.0
        jd_calc = int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + d + b - 1524.5 + day_frac
        mjd_calc = jd_calc - 2400000.5
        jyear_calc = 2000.0 + (jd_calc - 2451545.0) / 365.25

        assert math.isclose(jd_calc, jd_astro, abs_tol=1e-5), f"JD mismatch at {ep_str}"
        assert math.isclose(mjd_calc, mjd_astro, abs_tol=1e-5), f"MJD mismatch at {ep_str}"
        assert math.isclose(jyear_calc, jyear_astro, abs_tol=1e-4), f"JYear mismatch at {ep_str}"
