# Release Notes

## v2.3.0 — Phase 5 (NED) + Phase 7 (Cross-match) + Phase 8 (Measurement) + Phase 10 (HiPS compose)

### New endpoints

- `GET /api/catalogs/ned/object?name=…`
- `GET /api/catalogs/ned/cone?ra=&dec=&radius_deg=&max=`
- `GET /api/catalogs/ned/manifest`
- `GET /api/cross-match/at-position?ra=&dec=&radius_arcsec=&…`
- `POST /api/measurement/aperture` (with optional `magnitude_zeropoint`)
- `GET /api/hips/compose?ra=&dec=&fov_deg=&width_px=&height_px=&spherex_release=`

### New adapters

- `adapters/ned_adapter.py` — NASA/IPAC NED REST interface.
- `adapters/cross_match.py` — multi-survey join with frame-aware
  helio → CMB redshift correction (Carrick et al. 2015).
- `adapters/measurement.py` — aperture photometry over HiPS2FITS cutouts
  with sigma-clipped background (Bertin & Arnouts 1996) and iterative
  centroiding (Stetson 1987).
- `adapters/hips_compose.py` — multi-wavelength SED stack builder
  with deduplication and wavelength ordering.

### New fixtures

- `tests/fixtures/ned_objsearch/m87_envelope.json`
- `tests/fixtures/ned_objsearch/m87_photometry.json`
- `tests/fixtures/ned_objsearch/m87_cone_envelope.json`
- `tests/fixtures/gaia_tap/cone_search_pol_3sources.json`

### Scientific additions

- 4-frame redshift typing (`heliocentric`, `cmb`, `galactocentric`,
  `3k`) in NED responses.
- Helio → CMB conversion using the Local Group 3-D velocity vector
  `(74, 250, -310) km/s` (Carrick et al. 2015). The 1-D cosine
  approximation was found to be mathematically wrong and replaced.
- Luri 2018 parallax rules enforced at the row-parse layer.
- Bailer-Jones distance posteriors exposed via cds_adapter.

## v2.2.0 — Phase 11 (3D Atlas)

### New endpoints

- `GET /api/atlas/3d/cone?ra=&dec=&radius_deg=&max_results=`
- `GET /api/atlas/3d/manifest`

### New adapter

- `adapters/atlas_3d.py` — HEALPix-indexed Gaia DR3 cone search with
  strict parallax rules. Verified end-to-end against Polaris fixture:
  parallax 7.540 mas → 132.62 pc (Bailer-Jones 2021: 133 ± 0.5 pc ✓).

## v2.1.0 — Phase 12 (validation hardening)

- Recorded real fixtures for all major upstream services.
- Manifest with body hashes for every fixture.
- Every fixture has a sidecar `.yaml` documenting the URL pattern,
  content type, and the locks the test enforces.

## v2.0.0 — Phase 9 (W3C PROV-DM)

- Every successful response now includes a PROV bundle.
- Asymmetric uncertainty intervals are preserved as separate
  lower/upper fields.
- `adapters/provenance.py` is the single source of PROV bundles.

## v1.x — earlier phases

- v1.0: SPHEREx coverage + IRSA ObsTAP + SIA
- v1.1: SPExPI calibrated pipeline + persistent SQLite queue
- v1.2: WCS, MOC, HiPS engines
- v1.3: Solar system (JPL SBDB + Horizons)
- v1.4: Catalogs (CDS Sesame + SIMBAD + ADS)
- v1.5: Historical archive timeline
