# SPHEREx Odyssey — Architecture

## Overview

SPHEREx Odyssey is an astronomical atlas backend that strictly refuses
to fabricate scientific data. Every measurement, every magnitude, every
redshift traces back to an authentic upstream service or a captured
fixture replayed through the same adapter.

## Layered design

```
                ┌────────────────────────────────────────────┐
                │              FastAPI routers               │
                │  /spherex /catalogs /solar-system /atlas   │
                │  /cross-match /measurement /hips/compose   │
                │  /spectral-photometry /historical         │
                └──────────────────┬─────────────────────────┘
                                   │
                ┌──────────────────▼─────────────────────────┐
                │     adapters/  (scientific engine)         │
                │  · spherex_adapter  (IRSA SPExPI pipeline) │
                │  · spxpi_adapter    (queue + SQLite)       │
                │  · gaia_astrometry (ESA Gaia DR3 TAP)      │
                │  · atlas_3d         (HEALPix Gaia cone)    │
                │  · cds_adapter      (Sesame / SIMBAD / HiPS)│
                │  · ned_adapter      (NASA NED REST)        │
                │  · jpl_adapter      (SBDB / Horizons)      │
                │  · cross_match      (multi-survey join)    │
                │  · measurement      (aperture photometry)  │
                │  · hips_compose     (SED stack builder)    │
                │  · wcs_engine       (TAN solver, SIP)      │
                │  · moc_engine       (HEALPix cube index)   │
                │  · hips_engine      (IVOA HiPS registry)   │
                │  · provenance       (W3C PROV-DM bundles)  │
                └──────────────────┬─────────────────────────┘
                                   │
                ┌──────────────────▼─────────────────────────┐
                │  services/  (persistent state + jobs)      │
                │  · spectrum_jobs (SQLite SPExPI queue)     │
                │  · spxpi_pipeline (worker loop)            │
                └──────────────────┬─────────────────────────┘
                                   │
                ┌──────────────────▼─────────────────────────┐
                │  workers/  (long-running background jobs)  │
                └────────────────────────────────────────────┘
```

## Adapter contract

Each adapter exposes:

1. A typed scientific model (dataclass or Pydantic) that mirrors the
   published upstream schema. We never invent fields.
2. A URL builder that constructs the upstream URL from typed inputs.
   Bounds are enforced at the URL layer (no silent truncation).
3. A parse helper that maps the upstream JSON/XML envelope into the
   typed model. Rows with malformed fields are dropped with a log line.
4. An async driver that returns `None` (or raises a typed error) on
   network failure. **Never fabricates a substitute.**
5. A provenance block (W3C PROV-DM) is attached by the router.

## Scientific invariants

See `SCIENTIFIC_INVARIANTS.md` for the full list. Highlights:

- Luri et al. 2018 — never invert a negative or near-zero parallax.
- Bailer-Jones et al. 2021 — prefer catalogued posteriors over naive
  parallax inversion.
- Carrick et al. 2015 — helio → CMB frame conversion uses 3-D velocity
  dot product, not a 1-D cosine projection.
- M87 peculiar-infall check — SBF distance and Hubble-law distance
  must agree to within ~10% for low-z targets.
- All Phase 11+ fixtures use authentic published data. No invented
  bodies.

## W3C PROV-DM provenance

Every endpoint response includes a provenance block with:

- `prov:Entity`   : the dataset (the artifact returned)
- `prov:Activity` : the query/derivation that produced it
- `prov:Agent`    : the upstream service or pipeline

The provenance bundle is immutable per response and chains across
phases (a Phase 7 cross-match bundle references the per-survey
provenance blocks).

## Async lifecycle

`main.py` declares a FastAPI `lifespan` that:

1. Initialises the SQLite SPExPI job queue (`services.spectrum_jobs`).
2. Reconciles the IRSA SPHEREx release manifest
   (`adapters.spherex_adapter.release_registry`).
3. Logs which SPHEREx releases are live, which are retired, and the
   current IRSA reachability state.

A startup failure is logged but does NOT crash the server; the
registry degrades gracefully to `last_known_good` mode.

## Endpoints

See `ENDPOINTS.md` (or `main.py:app.get("/")`) for the full list.

| Phase | Path prefix | Notes |
|------:|-------------|-------|
| 1 | `/api/spherex/{releases,bands,search}` | IRSA SPHEREx coverage |
| 2 | `/api/spectrophotometry/jobs` | SPExPI calibrated pipeline |
| 3 | `/api/spherex/{wcs,moc,hips}` | WCS / MOC / HiPS engines |
| 4 | `/api/solar-system/{sbdb,cad,horizons}` | JPL SBDB + Horizons |
| 5 | `/api/catalogs/ned/{object,cone,manifest}` | NED extragalactic |
| 6 | `/api/catalogs/{resolve,literature}` | CDS Sesame / ADS |
| 7 | `/api/cross-match/at-position` | Multi-survey join |
| 8 | `/api/measurement/aperture` | Aperture photometry |
| 9 | `/api/provenance/...` | W3C PROV-DM bundles |
| 10 | `/api/hips/compose` | Multi-λ HiPS SED stack |
| 11 | `/api/atlas/3d/{cone,manifest}` | HEALPix Gaia cone |
| 12 | `/api/historical/{timeline,cutout-image}` | Real historical archive |
