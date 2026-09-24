"""SPHEREx Odyssey — Astronomical Backend Entrypoint with Authentic Science Pipelines."""

from __future__ import annotations

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.spherex import router as spherex_router
from routers.historical import router as historical_router
from routers.solar_system import router as solar_system_router
from routers.spectrophotometry import router as spectrophotometry_router
from routers.catalogs import router as catalogs_router
from routers.unified import router as unified_router
from routers.provenance import router as provenance_router
from routers.atlas_3d import router as atlas_3d_router
from routers.ned import router as ned_router
from routers.cross_match import router as cross_match_router
from routers.measurement import router as measurement_router
from routers.hips_compose import router as hips_compose_router
from services.spectrum_jobs import init_job_database
from adapters.spherex_adapter import release_registry

log = logging.getLogger("odyssey_lifespan")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager: initialize SQLite job queue and reconcile IRSA releases."""
    print("[SPHEREx Odyssey] Initializing persistent SPExPI SQLite job queue...")
    await init_job_database()
    print("[SPHEREx Odyssey] Astronomical Services & SQLite Database Ready.")

    # Phase 2: reconcile the static release manifest against IRSA's live TAP
    # catalogue. We do this once at startup so the first request after boot
    # already reflects the current IRSA release state instead of falling
    # straight back to last_known_good. A failure here is logged but does NOT
    # crash startup — the registry degrades gracefully and /spherex/releases
    # continues to work from the static manifest.
    try:
        snapshot = await release_registry.refresh()
        if snapshot.irsa_reachable:
            live = [r.release for r in snapshot.releases
                    if r.verification_status == "live"]
            print(f"[SPHEREx Odyssey] IRSA TAP reachable. Live releases: {live}.")
            if snapshot.retired_releases_present:
                print(f"[SPHEREx Odyssey] IRSA still publishes retired collections: "
                      f"{snapshot.retired_releases_present}")
        else:
            print(f"[SPHEREx Odyssey] IRSA TAP unreachable at startup "
                  f"({snapshot.last_irsa_error}). Registry operating in last_known_good mode.")
    except Exception as exc:  # pragma: no cover
        log.warning("Startup IRSA probe failed: %s", exc)

    yield
    print("[SPHEREx Odyssey] Astronomical Services shutdown complete.")


app = FastAPI(
    title="SPHEREx Odyssey API",
    description="Scientific backend powering SPHEREx Odyssey with authentic NASA SPHEREx (SPExPI), WISE/NEOWISE, JPL Horizons, and CDS/ESA services.",
    version="2.2.0",
    lifespan=lifespan,
)

# Configurable CORS for Next.js frontend
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers under /api (and root for clean backwards compatibility)
app.include_router(spherex_router, prefix="/api")
app.include_router(spherex_router)
app.include_router(historical_router, prefix="/api")
app.include_router(historical_router)
app.include_router(solar_system_router, prefix="/api")
app.include_router(solar_system_router)
app.include_router(spectrophotometry_router, prefix="/api")
app.include_router(spectrophotometry_router)
app.include_router(catalogs_router, prefix="/api")
app.include_router(catalogs_router)
app.include_router(unified_router)
app.include_router(unified_router, prefix="/api")
app.include_router(provenance_router, prefix="/api")
app.include_router(provenance_router)
app.include_router(atlas_3d_router)
app.include_router(ned_router, prefix="/api")
app.include_router(cross_match_router, prefix="/api")
app.include_router(measurement_router, prefix="/api")
app.include_router(hips_compose_router, prefix="/api")


@app.get("/")
async def root():
    """Authentic service status and capabilities."""
    return {
        "system": "SPHEREx Odyssey API",
        "status": "operational",
        "version": "2.3.0",
        "mission": "NASA SPHEREx (Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer)",
        "scientific_invariants": {
            "synthetic_data": "STRICTLY_PROHIBITED",
            "active_releases": ["SPHEREx QR3 (Weekly updates)", "SPHEREx QR2 (Reprocessed baseline)"],
            "retired_releases": ["SPHEREx QR1 (Retired by IRSA Feb 2026)"],
            "ephemeris_engine": "NASA/JPL SSD Horizons API",
            "spectrophotometry_engine": "SPExPI Calibrated Pipeline & Persistent SQLite Queue",
        },
        "docs_url": "/docs",
        "endpoints": [
            "/api/object/unified",
            "/api/spherex/releases",
            "/api/spherex/bands",
            "/api/spherex/search",
            "/api/spherex/wcs/solve",
            "/api/spherex/wcs/round-trip",
            "/api/spherex/moc/build",
            "/api/spherex/moc/intersect",
            "/api/spherex/hips/manifest",
            "/api/spectrophotometry/jobs",
            "/api/solar-system/sbdb/object",
            "/api/solar-system/cad/object",
            "/api/solar-system/horizons/ephemeris",
            "/api/catalogs/resolve",
            "/api/catalogs/literature",
            "/api/atlas/3d/cone",
            "/api/atlas/3d/manifest",
            "/api/catalogs/ned/object",
            "/api/catalogs/ned/cone",
            "/api/catalogs/ned/manifest",
            "/api/cross-match/at-position",
            "/api/measurement/aperture",
            "/api/hips/compose",
            "/api/historical/timeline",
            "/api/historical/cutout-image",
        ],
    }


@app.get("/healthz")
async def health_check():
    return {
        "status": "healthy",
        "service": "spherex-odyssey-backend",
        "engine": "spexpi-sqlite-v2.1",
        "scientific_integrity": "verified",
    }
