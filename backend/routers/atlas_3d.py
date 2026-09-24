"""Phase 11 — 3D Atlas endpoints.

The /api/atlas/3d/cone endpoint serves a HEALPix-indexed Gaia DR3 cone
search. The result is a list of (RA, Dec, distance_pc) triples plus the
W3C PROV-DM bundle identifying the ADQL query that produced them.

Phase 11 invariants enforced in this router:

  · Cone radius ∈ (0, 1°] (configurable upper bound).
  · Default parallax_min_mas = 0.001 (1 µas) — Luri et al. 2018 forbids
    naive inversion of negative parallax, and Bailer-Jones performs
    better with a positive parallax prior.
  · Negative parallax sources return distance_pc = None and a typed
    distance_method = "unavailable". The frontend renders them at the
    origin (or hides them in 3D).
  · W3C PROV-DM bundle attached to every response.
"""
from __future__ import annotations

from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from adapters.atlas_3d import (
    gaia_dr3_cone_search,
    ATLAS_CONE_MAX_RADIUS_DEG,
    ATLAS_CONE_MAX_RESULTS,
)

router = APIRouter(prefix="/api/atlas", tags=["Phase 11: 3D Atlas (Gaia DR3)"])


class Atlas3DPointOut(BaseModel):
    source_id: str
    ra_deg: float
    dec_deg: float
    parallax_mas: float
    parallax_err_mas: Optional[float]
    distance_pc: Optional[float]
    distance_method: str
    x_pc: Optional[float]
    y_pc: Optional[float]
    z_pc: Optional[float]
    pmra_masyr: Optional[float]
    pmdec_masyr: Optional[float]
    radial_velocity_kms: Optional[float]
    ruwe: Optional[float]
    phot_g_mean_mag: Optional[float]
    phot_bp_rp: Optional[float]


class Atlas3DConeResponse(BaseModel):
    ra_deg: float
    dec_deg: float
    radius_deg: float
    point_count: int
    truncated: bool
    points: List[Atlas3DPointOut]
    query_url: str
    query_started_at: str
    query_ended_at: Optional[str]
    w3c_provenance: Optional[Dict[str, Any]] = None


@router.get("/3d/cone", response_model=Atlas3DConeResponse)
async def atlas_3d_cone(
    ra: float = Query(
        ..., ge=0.0, lt=360.0,
        description="Right Ascension in degrees (J2000 / ICRS)",
    ),
    dec: float = Query(
        ..., ge=-90.0, le=90.0,
        description="Declination in degrees (J2000 / ICRS)",
    ),
    radius_deg: float = Query(
        default=0.1, gt=0.0, le=ATLAS_CONE_MAX_RADIUS_DEG,
        description=f"Cone radius in degrees (max {ATLAS_CONE_MAX_RADIUS_DEG}°)",
    ),
    parallax_min_mas: Optional[float] = Query(
        default=0.001, ge=-100.0, le=100.0,
        description="Minimum parallax in mas (default 0.001 = 1 μas). "
                    "Negative values allow negative-parallax sources per Luri et al. 2018 §5.",
    ),
    parallax_max_mas: Optional[float] = Query(
        default=None, ge=0.0, le=100.0,
        description="Maximum parallax in mas (None = no upper bound).",
    ),
    g_mag_max: Optional[float] = Query(
        default=None, ge=0.0, le=25.0,
        description="Maximum Gaia G magnitude (None = no bound).",
    ),
    max_results: int = Query(
        default=1000, gt=0, le=ATLAS_CONE_MAX_RESULTS,
        description=f"Maximum number of sources to return (max {ATLAS_CONE_MAX_RESULTS}).",
    ),
):
    """Gaia DR3 3D-atlas cone search.

    Executes a real ADQL query against the ESA Gaia archive and projects
    each Gaia source into 3D ICRS cartesian coordinates. Distance is
    1000/ϖ [mas → pc] for sources with positive parallax (Luri et al.
    2018 simple-inversion regime); sources with negative parallax return
    distance_pc = None.

    Optional filters: parallax_min_mas (defaults to 1 μas to filter noise),
    parallax_max_mas (sanity bound), g_mag_max (brightness cut).
    """
    result = await gaia_dr3_cone_search(
        ra, dec, radius_deg,
        parallax_min_mas=parallax_min_mas,
        parallax_max_mas=parallax_max_mas,
        g_mag_max=g_mag_max,
        max_results=max_results,
    )
    if result is None:
        raise HTTPException(
            status_code=502,
            detail=(
                "Gaia DR3 cone search unavailable. The cone search is a "
                "live query against gea.esac.esa.int; no synthetic sources "
                "are substituted on failure. Retry once ESA is reachable."
            ),
        )

    return Atlas3DConeResponse(
        ra_deg=result.ra_deg,
        dec_deg=result.dec_deg,
        radius_deg=result.radius_deg,
        point_count=result.point_count,
        truncated=result.truncated,
        points=[
            Atlas3DPointOut(
                source_id=p.source_id,
                ra_deg=p.ra_deg,
                dec_deg=p.dec_deg,
                parallax_mas=p.parallax_mas,
                parallax_err_mas=p.parallax_err_mas,
                distance_pc=p.distance_pc,
                distance_method=p.distance_method,
                x_pc=p.x_pc,
                y_pc=p.y_pc,
                z_pc=p.z_pc,
                pmra_masyr=p.pmra_masyr,
                pmdec_masyr=p.pmdec_masyr,
                radial_velocity_kms=p.radial_velocity_kms,
                ruwe=p.ruwe,
                phot_g_mean_mag=p.phot_g_mean_mag,
                phot_bp_rp=p.phot_bp_rp,
            )
            for p in result.points
        ],
        query_url=result.query_url,
        query_started_at=result.query_started_at,
        query_ended_at=result.query_ended_at,
        w3c_provenance=result.w3c_provenance,
    )


@router.get("/3d/manifest", response_model=Dict[str, Any])
async def atlas_3d_manifest():
    """Static metadata for the 3D atlas endpoint family."""
    return {
        "name": "3D Atlas",
        "phase": 11,
        "engine": "ESA Gaia DR3 TAP via ADQL cone search",
        "endpoints": {
            "cone_search": "/api/atlas/3d/cone",
        },
        "limits": {
            "max_radius_deg": ATLAS_CONE_MAX_RADIUS_DEG,
            "max_results": ATLAS_CONE_MAX_RESULTS,
            "parallax_floor_mas": 0.001,
            "parallax_ceiling_mas": 100.0,
        },
        "scientific_invariants": {
            "no_synthetic_sources": True,
            "no_negative_parallax_inversion": True,
            "provenance_attached": "W3C PROV-DM (prov:Entity, prov:Activity, prov:Agent)",
            "distance_method_unavailable_when_parallax_le_0": True,
        },
    }
