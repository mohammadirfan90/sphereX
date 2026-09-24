# Adapter Inventory

A complete listing of every external service the backend integrates
with. Each entry includes the upstream URL, the adapter module, and
the test coverage.

## Authoritative astronomical services

### NASA/IPAC IRSA — SPHEREx

| | |
|--|--|
| **Base URL** | `https://irsa.ipac.caltech.edu` |
| **Adapter** | `adapters/spherex_adapter.py` |
| **Router** | `routers/spherex.py` |
| **Endpoints used** | `/TAP/sync` (ObsTAP), `/SIA` (SIA) |
| **Coverage** | SPHEREx QR2, QR3 (live); QR1 (retired Feb 2026) |
| **Tests** | `tests/test_invariant_*.py` |

### NASA/IPAC IRSA — SPExPI Pipeline

| | |
|--|--|
| **Base URL** | Internal SPExPI service |
| **Adapter** | `adapters/spexpi_adapter.py` |
| **Router** | `routers/spectrophotometry.py` |
| **Storage** | `services/spectrum_jobs.py` (SQLite) |
| **Tests** | `tests/test_spexpi_*.py` |

### ESA Gaia DR3 TAP

| | |
|--|--|
| **Base URL** | `https://gea.esac.esa.int/tap-server/tap/sync` |
| **Adapters** | `adapters/cds_adapter.py`, `adapters/atlas_3d.py` |
| **Routers** | `routers/catalogs.py`, `routers/atlas_3d.py` |
| **Tables** | `gaiadr3.gaia_source`, `external.gaiadr3_geometric_distance`, `external.gaiadr3_photogeometric_distance` |
| **Tests** | `tests/test_invariant_atlas_3d.py` |

### NASA/IPAC NED

| | |
|--|--|
| **Base URL** | `https://ned.ipac.caltech.edu` |
| **Adapter** | `adapters/ned_adapter.py` |
| **Router** | `routers/ned.py` |
| **Endpoints used** | `/cgi-bin/objsearch`, `/cgi-bin/neddata` |
| **Tests** | `tests/test_invariant_ned.py` |

### NASA/JPL SSD SBDB

| | |
|--|--|
| **Base URL** | `https://ssd-api.jpl.nasa.gov/sbdb.api` |
| **Adapter** | `adapters/jpl_adapter.py` |
| **Router** | `routers/solar_system.py` |
| **Endpoints used** | `?sstr=…&phys-par=1` |
| **Tests** | `tests/test_invariant_*.py` |

### NASA/JPL Horizons

| | |
|--|--|
| **Base URL** | `https://ssd.jpl.nasa.gov/api/horizons.api` |
| **Adapter** | `adapters/jpl_adapter.py` |
| **Router** | `routers/solar_system.py` |
| **Endpoint used** | `?format=text&COMMAND=…&EPHEM_TYPE=OBSERVER` |
| **Tests** | `tests/test_invariant_*.py` |

### CDS Sesame / SIMBAD

| | |
|--|--|
| **Base URL** | `https://cds.unistra.fr` |
| **Adapter** | `adapters/cds_adapter.py` |
| **Router** | `routers/catalogs.py` |
| **Endpoints used** | `/cgi-bin/nph-sesame`, `/simbad/sim-tap/sync` |
| **Tests** | `tests/test_invariant_*.py` |

### CDS alasky HiPS2FITS

| | |
|--|--|
| **Base URL** | `https://alasky.cds.unistra.fr/hips-image-services/hips2fits` |
| **Adapter** | `adapters/cds_adapter.py` (URL builder), `adapters/measurement.py` (consumer) |
| **Tests** | `tests/test_invariant_measurement.py`, `tests/test_invariant_hips_compose.py` |

### IVOA HiPS registry

| | |
|--|--|
| **Base URL** | Static registry in `adapters/hips_engine.py` |
| **Adapter** | `adapters/hips_engine.py`, `adapters/hips_compose.py` |
| **Router** | `routers/spherex.py`, `routers/hips_compose.py` |
| **Layers registered** | SPHEREx QR2/QR3 (6 bands each); DSS2, 2MASS, WISE (context) |
| **Tests** | `tests/test_invariant_wcs_moc_hips.py`, `tests/test_invariant_hips_compose.py` |

### NASA ADS (optional, requires `ADS_API_TOKEN`)

| | |
|--|--|
| **Base URL** | `https://api.adsabs.harvard.edu/v1/search/query` |
| **Adapter** | inline in `routers/catalogs.py` |
| **Tests** | `tests/test_invariant_*.py` |

## Internal-only modules

These do not contact external services and exist purely as in-process
engines:

- `adapters/wcs_engine.py` — TAN solver with SIP support
- `adapters/moc_engine.py` — pure-Python HEALPix cube encoding
- `adapters/cross_match.py` — multi-survey join (driver)
- `adapters/measurement.py` — aperture photometry over HiPS2FITS cutouts
- `adapters/provenance.py` — W3C PROV-DM bundle builder

## Adapter contract

Every adapter exports:

```python
async def query_<thing>(...) -> Optional[<TypedModel>]:
    """..."""
```

And one or more synchronous URL builders:

```python
def build_<endpoint>_url(...) -> str:
    """..."""
```

Bounds and shape validations live in the URL builders, not in the
drivers. This keeps the boundary clear: if you can build the URL,
you can call the endpoint.

## Fixture replay contract

All tests that exercise adapter logic MUST do so against captured
fixtures in `tests/fixtures/`. The MANIFEST.json file documents each
fixture's origin, adapter contract, and the locks the test enforces.
A fixture body change invalidates the manifest hash and requires
re-validation against the live service.
