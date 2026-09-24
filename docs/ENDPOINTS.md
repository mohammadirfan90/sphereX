# Endpoint Reference

Auto-curated from `main.py`. The root `/` endpoint returns the
authoritative list. This document is a navigable index with brief
descriptions.

## Service status

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/` | Service manifest with version, live releases, and endpoint list |
| GET | `/healthz` | Liveness check (no network) |

## SPHEREx coverage

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/api/spherex/releases` | IRSA live release manifest (QR3/QR2) |
| GET | `/api/spherex/bands` | SPHEREx LVF band metadata |
| GET | `/api/spherex/search` | Coordinate → SPHEREx SIA coverage query |

## SPHEREx engines (Phase 3)

| Method | Path | Description |
|-------:|------|-------------|
| POST | `/api/spherex/wcs/solve` | Solve a WCS header (TAN + SIP) |
| POST | `/api/spherex/wcs/round-trip` | Validate a WCS round-trip |
| POST | `/api/spherex/moc/build` | Build an MOC from a list of points |
| POST | `/api/spherex/moc/intersect` | MOC cone intersection / union |
| GET | `/api/spherex/hips/manifest` | IVOA HiPS layer manifest |

## SPExPI pipeline (Phase 1-2)

| Method | Path | Description |
|-------:|------|-------------|
| POST | `/api/spectrophotometry/jobs` | Submit a calibration job |
| GET | `/api/spectrophotometry/jobs` | List recent jobs |

## Solar system (Phase 4)

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/api/solar-system/sbdb/object` | JPL SBDB lookup by designation |
| GET | `/api/solar-system/cad/object` | JPL close-approach lookup |
| GET | `/api/solar-system/horizons/ephemeris` | JPL Horizons text ephemeris |

## Catalogs (Phase 5, 6)

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/api/catalogs/resolve` | CDS Sesame / SIMBAD name resolver |
| GET | `/api/catalogs/literature` | NASA ADS bibliography (auth optional) |
| GET | `/api/catalogs/ned/object` | NED object by name |
| GET | `/api/catalogs/ned/cone` | NED cone search around (RA, Dec) |
| GET | `/api/catalogs/ned/manifest` | NED adapter capabilities |

## Cross-survey matching (Phase 7)

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/api/cross-match/at-position` | Multi-survey join around (RA, Dec) |

## Measurement (Phase 8)

| Method | Path | Description |
|-------:|------|-------------|
| POST | `/api/measurement/aperture` | HiPS2FITS cutout + aperture photometry |

## Provenance (Phase 9)

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/api/provenance/...` | W3C PROV-DM bundles per measurement |

## HiPS composition (Phase 10)

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/api/hips/compose` | Multi-wavelength SED stack |

## 3D atlas (Phase 11)

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/api/atlas/3d/cone` | HEALPix Gaia DR3 cone search |
| GET | `/api/atlas/3d/manifest` | 3D atlas capabilities |

## Historical archive (Phase 12)

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/api/historical/timeline` | Real annotated astronomical events |
| GET | `/api/historical/cutout-image` | Historical DSS cutout by event |

## Unified

| Method | Path | Description |
|-------:|------|-------------|
| GET | `/api/object/unified` | Single endpoint resolving a target across surveys |
