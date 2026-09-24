# Deployment

## Requirements

- Python 3.11+
- See `backend/requirements.txt` for pinned dependencies.
- Optional but recommended for the measurement engine: `numpy`,
  `Pillow`.

## Local development

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The OpenAPI docs are at `http://127.0.0.1:8000/docs`.

## Environment variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `ADS_API_TOKEN` | NASA ADS literature search | Optional |
| `OUTBOUND_PROXY` | HTTPS proxy URL | Optional |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins | Optional |

If `ADS_API_TOKEN` is unset, the `/catalogs/literature` endpoint
returns an explicit `api_token_unconfigured` status with the direct
ADS search URL — it does NOT fabricate bibcodes.

## Production

A reference `gunicorn` invocation:

```bash
gunicorn main:app -k uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8000 --workers 2 --timeout 60
```

For container deployment, use a minimal image:

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
EXPOSE 8000
CMD ["gunicorn", "main:app", "-k", "uvicorn.workers.UvicornWorker",
     "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "60"]
```

The SQLite database is created on first startup; for production,
mount a persistent volume at `backend/spherex_calibration_files/`.

## Network requirements

The backend makes outbound HTTPS calls to:

- `irsa.ipac.caltech.edu` (SPHEREx, IRSA HiPS, WISE, 2MASS)
- `gea.esac.esa.int` (Gaia DR3 TAP)
- `ned.ipac.caltech.edu` (NED)
- `ssd-api.jpl.nasa.gov` (SBDB)
- `ssd.jpl.nasa.gov` (Horizons)
- `cds.unistra.fr`, `alasky.cds.unistra.fr` (CDS / Sesame / SIMBAD)
- `alasky.u-strasbg.fr` (DSS2)
- `api.adsabs.harvard.edu` (ADS, optional)

All traffic is HTTPS (port 443). A TLS-terminating egress proxy works.

## Health and readiness

- `GET /healthz` — liveness; returns immediately without network.
- `GET /` — service manifest; includes the live release list.

There is no dedicated readiness endpoint. The service is considered
ready once `init_job_database` has completed (within ~100 ms) and the
IRSA reconciliation has either succeeded or logged a fallback.

## CORS

`main.py` declares an allow-list:

```python
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
```

Add your production frontend origin here, or replace the list with a
configuration source if you need runtime overrides.

## Database backups

The SQLite database contains SPExPI job state. To back up:

```bash
sqlite3 spherex_calibration_files/jobs.sqlite3 ".backup '/path/to/backup.db'"
```

Restoring is a file replacement while the server is stopped.

## Upgrades

1. Pull the new code.
2. `pip install -r requirements.txt` (in case of new dependencies).
3. Restart the workers.
4. The release manifest reconciles automatically on startup.

There are no schema migrations: the SQLite schema is
forward-compatible because the server only writes rows it has read
before.
