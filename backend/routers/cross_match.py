"""Cross-survey matching router (Phase 7).

Endpoints:

  GET /api/cross-match/at-position
       — Run a unified cross-match around (RA, Dec). Joins Gaia DR3, NED,
         SIMBAD, and 2MASS/WISE HiPS cutouts in a single request. Returns
         the typed CrossMatchResult envelope with per-survey separation
         and provenance.

The router never fabricates records. A survey that did not return a row
leaves its field as None in the response.
"""
from __future__ import annotations

import logging
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from adapters.cross_match import (
    CrossMatchResult,
    GaiaCrossMatch,
    NEDCrossMatch,
    SIMBADCrossMatch,
    HiPSCutoutMatch,
    cross_match_at_position,
    CrossMatchConeInvalid,
    DEFAULT_GAIA_CONE_ARCSEC,
    DEFAULT_NED_CONE_ARCSEC,
    DEFAULT_HIPS_CONE_ARCSEC,
    DEFAULT_SIMBAD_CONE_ARCSEC,
)
from adapters.provenance import build_provenance_bundle

log = logging.getLogger("cross_match_router")
router = APIRouter(prefix="/cross-match", tags=["Cross-survey matching"])


# ── Pydantic response models ────────────────────────────────────────────────


class GaiaCrossMatchResponse(BaseModel):
    source_id: Optional[str] = None
    ra_deg: Optional[float] = None
    dec_deg: Optional[float] = None
    parallax_mas: Optional[float] = None
    parallax_error_mas: Optional[float] = None
    pmra_masyr: Optional[float] = None
    pmdec_masyr: Optional[float] = None
    radial_velocity_kms: Optional[float] = None
    ruwe: Optional[float] = None
    phot_g_mean_mag: Optional[float] = None
    separation_arcsec: Optional[float] = None


class NEDCrossMatchResponse(BaseModel):
    canonical_name: Optional[str] = None
    ra_deg: Optional[float] = None
    dec_deg: Optional[float] = None
    object_type: Optional[str] = None
    redshift: Optional[float] = None
    redshift_frame: Optional[str] = None
    velocity_kms: Optional[float] = None
    distance_mpc: Optional[float] = None
    distance_method: Optional[str] = None
    separation_arcsec: Optional[float] = None


class SIMBADCrossMatchResponse(BaseModel):
    canonical_name: Optional[str] = None
    ra_deg: Optional[float] = None
    dec_deg: Optional[float] = None
    object_type: Optional[str] = None
    spectral_type: Optional[str] = None
    separation_arcsec: Optional[float] = None


class HiPSCutoutMatchResponse(BaseModel):
    hips_id: str
    cutout_url: str
    field_of_view_deg: float
    center_pixel_x: Optional[int] = None
    center_pixel_y: Optional[int] = None


class CrossMatchResponse(BaseModel):
    query_ra_deg: float
    query_dec_deg: float
    query_radius_arcsec: float
    gaia: Optional[GaiaCrossMatchResponse] = None
    ned: Optional[NEDCrossMatchResponse] = None
    simbad: Optional[SIMBADCrossMatchResponse] = None
    hips_cutouts: List[HiPSCutoutMatchResponse] = Field(default_factory=list)
    ambiguity_flag: bool = False
    notes: List[str] = Field(default_factory=list)
    provenance: dict


# ── Conversion ───────────────────────────────────────────────────────────────


def _result_to_response(r: CrossMatchResult) -> CrossMatchResponse:
    gaia = None
    if r.gaia is not None:
        gaia = GaiaCrossMatchResponse(**r.gaia.__dict__)
    ned = None
    if r.ned is not None:
        ned = NEDCrossMatchResponse(**r.ned.__dict__)
    simbad = None
    if r.simbad is not None:
        simbad = SIMBADCrossMatchResponse(**r.simbad.__dict__)
    hips = [
        HiPSCutoutMatchResponse(
            hips_id=h.hips_id,
            cutout_url=h.cutout_url,
            field_of_view_deg=h.field_of_view_deg,
            center_pixel_x=h.center_pixel_x,
            center_pixel_y=h.center_pixel_y,
        )
        for h in r.hips_cutouts
    ]
    # Augment the adapter's minimal provenance with the full PROV-DM bundle.
    prov = build_provenance_bundle(
        service="ESA Gaia DR3 + NASA/IPAC NED + CDS SIMBAD + CDS HiPS2FITS",
        endpoint="multi-survey cone (ra, dec, radius_arcsec)",
        adapter_contract="adapters.cross_match:cross_match_at_position",
        extra={
            "query_ra_deg": r.query_ra_deg,
            "query_dec_deg": r.query_dec_deg,
            "query_radius_arcsec": r.query_radius_arcsec,
            "ambiguity_flag": r.ambiguity_flag,
            "notes_count": len(r.notes),
            **r.provenance,
        },
    )
    return CrossMatchResponse(
        query_ra_deg=r.query_ra_deg,
        query_dec_deg=r.query_dec_deg,
        query_radius_arcsec=r.query_radius_arcsec,
        gaia=gaia,
        ned=ned,
        simbad=simbad,
        hips_cutouts=hips,
        ambiguity_flag=r.ambiguity_flag,
        notes=r.notes,
        provenance=prov,
    )


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/at-position", response_model=CrossMatchResponse)
async def cross_match_at_position_endpoint(
    ra: float = Query(..., ge=0.0, lt=360.0, description="J2000 RA in degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="J2000 Dec in degrees"),
    radius_arcsec: float = Query(
        1.0, gt=0.0, le=600.0,
        description="Cross-match cone radius in arcseconds (max 600'' = 10')",
    ),
    gaia_cone_arcsec: float = Query(
        DEFAULT_GAIA_CONE_ARCSEC, gt=0.0, le=600.0,
        description="Gaia DR3 cone (tighter than envelope, default 1'')",
    ),
    ned_cone_arcsec: float = Query(
        DEFAULT_NED_CONE_ARCSEC, gt=0.0, le=600.0,
        description="NED cone (default 5'')",
    ),
    hips_cone_arcsec: float = Query(
        DEFAULT_HIPS_CONE_ARCSEC, gt=0.0, le=600.0,
        description="HiPS context cone (default 30''; coarse context, not astrometric)",
    ),
    apply_cmb_correction: bool = Query(
        False,
        description="Convert NED heliocentric redshifts to CMB frame (Carrick 2015)",
    ),
):
    """Cross-match Gaia DR3, NED, SIMBAD, and HiPS cutouts around (RA, Dec).

    The response contains a typed envelope with one field per survey.
    A survey that did not return a row leaves its field as ``null``.
    The ``notes`` list records per-survey failures (network, missing
    counterparts, etc.) so the caller can interpret partial matches.
    """
    t0 = time.monotonic()
    try:
        result = await cross_match_at_position(
            ra_deg=ra,
            dec_deg=dec,
            radius_arcsec=radius_arcsec,
            gaia_cone_arcsec=gaia_cone_arcsec,
            ned_cone_arcsec=ned_cone_arcsec,
            hips_cone_arcsec=hips_cone_arcsec,
            apply_cmb_correction=apply_cmb_correction,
        )
    except CrossMatchConeInvalid as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        log.exception("Cross-match failed at (%f, %f)", ra, dec)
        raise HTTPException(status_code=500, detail=f"Cross-match error: {exc}")

    log.info(
        "Cross-match ra=%f dec=%f r=%f'' -> gaia=%s ned=%s simbad=%s hips=%d in %.2fs",
        ra, dec, radius_arcsec,
        "hit" if result.gaia else "miss",
        "hit" if result.ned else "miss",
        "hit" if result.simbad else "miss",
        len(result.hips_cutouts),
        time.monotonic() - t0,
    )
    return _result_to_response(result)
