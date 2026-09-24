# Scientific Invariants

SPHEREx Odyssey refuses to fabricate astronomical data. This document
catalogs the scientific invariants enforced at every level — from URL
construction to final response — and the references they derive from.

## 1. Synthetic data is forbidden

**No invented values, ever.** A failed upstream call returns `None`,
an HTTP 502, or a 404 — never a plausible-looking fallback.

Covered by tests:

- `tests/test_invariant_atlas_3d.py` — Polaris distance from real Gaia
  DR3 fixture.
- `tests/test_invariant_ned.py` — M87 envelope parses real NED values;
  photometry rollup covers published surveys.
- `tests/test_invariant_measurement.py` — synthetic cutout with known
  inputs; flux and centroid match the ground truth.

## 2. Luri et al. 2018 — parallax inversion rules

Reference: Luri et al. 2018, A&A 616, A9 ("Gaia Data Release 2 —
Using Gaia parallaxes").

The naive parallax-inversion distance `d = 1/π` is mathematically
invalid for:

- `π ≤ 0` (negative parallax)
- `|π| ≲ σ_π` (low SNR)
- `|π| > 100 mas` (suspicious row, almost certainly a typo)

The atlas_3d adapter enforces all three rules. Coverage:

- `tests/test_invariant_atlas_3d.py::TestRowToAtlasPoint::test_negative_parallax_yields_no_distance`
- `tests/test_invariant_atlas_3d.py::TestRowToAtlasPoint::test_zero_parallax_yields_no_distance`
- `tests/test_invariant_atlas_3d.py::TestRowToAtlasPoint::test_pathologically_large_parallax_yields_no_distance`

## 3. Bailer-Jones et al. 2021 — distance posteriors

Reference: Bailer-Jones et al. 2021, AJ 161, 147 ("Estimating distances
from parallaxes. IV. Distances to 1.33 billion stars in Gaia EDR3").

For Gaia DR3 sources, the published geometric and photogeometric
posteriors (`r_med_geo`, `r_lo_geo`, `r_hi_geo`, etc.) are preferred
over naive inversion. The cds_adapter exposes them via
`query_gaia_bailer_jones_distance` (asymmetric intervals are
preserved — see provenance rules).

## 4. Carrick et al. 2015 — helio → CMB frame conversion

Reference: Carrick et al. 2015, MNRAS 450, 317 ("Cosmological
parameters from the comparison of peculiar velocities with predictions
from the 2M++ density field").

The Local Group CMB velocity in Galactic Cartesian components is
`(U, V, W) = (+74, +250, -310) km/s`. Frame conversion uses the 3-D
velocity dot product with the unit vector toward the target in
Galactic coordinates (l, b), NOT a 1-D cosine projection.

Coverage:

- `tests/test_invariant_cross_match.py::TestFrameConversion::test_cmb_correction_varies_across_sky`
- `tests/test_invariant_cross_match.py::TestFrameConversion::test_cmb_correction_magnitude_bounded`

The magnitude bound: `|Δz| ≤ |v_LG| / c ≈ 1.35 × 10⁻³`.

## 5. NED photometric contract

Reference: NED API docs at https://ned.ipac.caltech.edu/help/Documents/api/intro.

- Photometric rows missing both `Mag` and `Flux` are dropped
  (no fabricated zero-magnitude entries).
- Redshift frame is one of the four legal values; anything else is
  rejected at construction time.

Coverage: `tests/test_invariant_ned.py::TestPhotometryParser`.

## 6. Bertin & Arnouts 1996 — background estimation

Reference: Bertin & Arnouts 1996, A&AS 117, 393 ("SExtractor: Software
for source extraction").

The measurement engine uses the standard 3-sigma iterative clipped
median, with a robust 1.4826 × MAD noise estimator. Up to 5 iterations
of clipping are run.

Coverage: `tests/test_invariant_measurement.py::TestBackground`.

## 7. Stetson 1987 — photometric SNR

Reference: Stetson 1987, PASP 99, 191 ("DAOPHOT — A computer program
for crowded-field stellar photometry").

Magnitude uncertainty is `1.0857 / SNR` (the standard Stetson formula).
This is reported only when a photometric zeropoint is supplied.

## 8. Vincenty formula — angular separation

The Vincenty spherical law of cosines is used throughout for cone
matches. The implementation in `adapters.cross_match` uses the form:

```
cos(θ) = sin(φ₁) sin(φ₂) + cos(φ₁) cos(φ₂) cos(λ₁ - λ₂)
```

NOT the (mathematically equivalent but numerically less stable)
alternative ordering. Coverage:
`tests/test_invariant_cross_match.py::TestAngularSeparation`.

## 9. WCS round-trip

A successful WCS solve must round-trip pixel ↔ sky ↔ pixel to within
`1e-3 px` at the tangent point. SIP distortion terms, when present,
are applied additively on top of the linear TAN projection.

Coverage: `tests/test_invariant_wcs_moc_hips.py::TestWCSInvariant`.

## 10. HEALPix invariant (note: not standard Górski layout)

The Phase 3 MOC engine uses a self-consistent cube-z-curve encoding
that is NOT the standard Górski et al. 2005 HEALPix tessellation. The
two are equivalent for cone-intersection tests but NOT for
neighbour-pair queries. Where full-fidelity HEALPix is required
(mocpy-backed operations), the system falls back to the published
external library. This trade-off is documented in the engine's
docstring and is honest — the encoder and decoder are mutual
inverses, but neither claims to be the standard.

## 11. SPHEREx LVF bands

The SPHEREx Linear Variable Filter covers 0.75-4.1 µm in 6 detector
arrays (D1-D6). Band centres:

| Band | Range (µm) | Centre (µm) |
|------|-----------|------------|
| D1 | 0.75-1.00 | 0.875 |
| D2 | 1.00-1.40 | 1.250 |
| D3 | 1.40-1.90 | 1.650 |
| D4 | 1.90-2.40 | 2.150 |
| D5 | 2.40-3.10 | 2.850 |
| D6 | 3.10-4.10 | 3.600 |

Coverage: `tests/test_invariant_hips_compose.py::TestWavelengthMapping`.

## 12. IVOA HiPS provenance

Every HiPS layer registered in `adapters/hips_engine.py` carries its
IVOA `creator_did` and `prov_progenitor`. We do not register any HiPS
layer whose base URL we have not validated against the IRSA / CDS HiPS
registries.

## 13. W3C PROV-DM

Every response attaches a PROV bundle with the upstream endpoint URL,
the adapter contract symbol, and any cross-referenced prior blocks.
Asymmetric uncertainties are preserved as separate lower/upper fields;
the system never collapses `r_lo` and `r_hi` to `±σ`.

## 14. SciPy/NumPy-free core

The backend's adapters and engines depend only on the Python standard
library and `httpx`. The measurement engine requires `numpy` and
`Pillow`; these are loaded lazily so a missing install returns 503
rather than crashing the server.

## 15. No real outbound calls in tests

Test code MUST NOT hit the live NASA/ESA/CDS servers. We replay
captured fixtures via httpx mocks; the MANIFEST.json file documents
each fixture's origin and adapter contract. A fixture whose body
changes requires explicit re-validation against the live service
before re-committing.
