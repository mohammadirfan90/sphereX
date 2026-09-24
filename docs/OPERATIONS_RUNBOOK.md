# Operations Runbook

## Startup

The backend boots via `uvicorn main:app --host 0.0.0.0 --port 8000`.
The FastAPI `lifespan` manager:

1. Initialises the SQLite SPExPI job queue
   (`services/spectrum_jobs.init_job_database`).
2. Reconciles the IRSA SPHEREx release manifest
   (`adapters/spherex_adapter.release_registry.refresh`).

A startup failure in (2) is logged but does NOT crash the server —
the registry falls back to `last_known_good` mode and the
`/spherex/releases` endpoint continues to serve the static manifest.

### Expected startup log

```
[SPHEREx Odyssey] Initializing persistent SPExPI SQLite job queue...
[SPHEREx Odyssey] Astronomical Services & SQLite Database Ready.
[SPHEREx Odyssey] IRSA TAP reachable. Live releases: ['qr3', 'qr2'].
[SPHEREx Odyssey] Astronomical Services shutdown complete.
```

### Failure mode

```
[SPHEREx Odyssey] IRSA TAP unreachable at startup (...last error...).
                   Registry operating in last_known_good mode.
```

If this appears:

1. Check that the host has outbound HTTPS to `irsa.ipac.caltech.edu`.
2. Check the `OUTBOUND_PROXY` environment variable if used.
3. Verify with `curl https://irsa.ipac.caltech.edu/TAP/sync?...`.

## Health checks

- `GET /healthz` — liveness. Returns `{"status": "healthy", ...}`.
- `GET /` — service manifest including version and live releases.

## Common error responses

| Code | Cause | Action |
|-----:|-------|--------|
| 400 | Bad input (e.g. RA out of range, radius too large) | Validate the query parameters |
| 404 | Upstream has no record for the requested name | Confirm the upstream itself has the record |
| 502 | Upstream unreachable | Check outbound network; check upstream status |
| 503 | Dependency missing (e.g. Pillow, numpy) | Install missing dependency |

## SPExPI queue management

The SQLite job queue is at `backend/spherex_calibration_files/jobs.sqlite3`.
To inspect:

```bash
sqlite3 jobs.sqlite3 "SELECT id, status, created_at FROM jobs ORDER BY created_at DESC LIMIT 20;"
```

To restart a stuck job:

```bash
sqlite3 jobs.sqlite3 "UPDATE jobs SET status='pending' WHERE id='…';"
```

The worker loop (`workers/spexpi_worker.py`) polls every 5 seconds.

## Release reconciliation

The release manifest is reconciled on every server startup. To force
a reconciliation without restarting:

```python
from adapters.spherex_adapter import release_registry
await release_registry.refresh()
```

The reconciliation probes the IRSA ObsTAP for `spherex_qr3` and
`spherex_qr2` collections, and the IRSA SIA for live coverage. Results
are cached for the lifetime of the process.

## Logs

- `odyssey_lifespan` — startup and shutdown
- `ned_router`, `gaia_astrometry`, `cross_match_router` — per-request
- `spectrum_jobs` — queue state

## Known caveats

- The cross-match cone is bounded at 600 arcseconds (10'). Larger
  requests fail with HTTP 400.
- The aperture photometry engine requires `numpy` and `Pillow`;
  without them, the endpoint returns 503.
- WCS, MOC, and HiPS engines have no third-party dependencies and
  work in any environment.

## Recovery procedures

### "IRSA TAP unreachable" after a long uptime

1. Check `curl https://irsa.ipac.caltech.edu/TAP/sync?...`.
2. If the upstream is genuinely down, accept the degraded state; the
   manifest endpoint still serves the last successful snapshot.
3. When IRSA recovers, restart the backend or call
   `await release_registry.refresh()` to clear the staleness.

### "Pillow not installed" on a fresh server

```bash
pip install Pillow numpy
```

The endpoint returns 503 with an explicit message until both are
present.
