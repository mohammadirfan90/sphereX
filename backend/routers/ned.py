"""NASA/IPAC Extragalactic Database (NED) Router.

Provides three endpoints backed by the live NED REST interface:

  GET /api/catalogs/ned/object?name=<name>
       — Resolves a single NED object by name. Returns canonical name,
         J2000 position, object type, heliocentric redshift, and (when
         available) the multi-wavelength photometry roll-up. The
         photometry is never synthesised: a photometry-only failure is
         surfaced in the response with no replacement values.

  GET /api/catalogs/ned/cone?ra=&dec=&radius_deg=&max=
       — Cone-search NED around (RA, Dec). Returns the nearest NED
         objects sorted by separation. Each hit carries the published
         redshift and co-moving distance.

  GET /api/catalogs/ned/manifest
       — Static manifest of NED API capabilities (no network call).

All endpoints attach a W3C PROV-DM bundle with the upstream URL,
method, and adapter contract; the router itself never fabricates
astronomical content.
"""
from __future__ import annotations

import logging
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from adapters.ned_adapter import (
    NEDObject,
    NEDConeResult,
    NEDPhotometryPoint,
    NEDRedshift,
    query_ned_by_name,
    query_ned_cone,
    NED_MAX_CONE_RADIUS_DEG,
    NEDError,
    NEDConnectionUnreachable,
    NEDResponseMalformed,
    NEDNotFound,
    NED_BASE_URL,
)
from adapters.provenance import build_provenance_bundle

log = logging.getLogger("ned_router")

router = APIRouter(prefix="/catalogs/ned", tags=["NED (Extragalactic)"])


# ── Pydantic response models ────────────────────────────────────────────────


class NEDRedshiftResponse(BaseModel):
    value: float
    frame: str
    uncertainty: Optional[float] = None
    reference: Optional[str] = None


class NEDPhotometryResponse(BaseModel):
    survey: str
    band: str
    magnitude: Optional[float] = None
    magnitude_uncertainty: Optional[float] = None
    flux_density: Optional[float] = None
    flux_density_uncertainty: Optional[float] = None
    frequency_hz: Optional[float] = None
    wavelength_angstrom: Optional[float] = None
    reference: Optional[str] = None


class NEDObjectResponse(BaseModel):
    """Pydantic mirror of NEDObject for the JSON response envelope."""
    query: str
    canonical_name: str
    ra_deg: float
    dec_deg: float
    object_type: str
    redshift: Optional[NEDRedshiftResponse] = None
    redshift_qualifier: Optional[str] = None
    velocity_kms: Optional[float] = None
    distance_mpc: Optional[float] = None
    distance_method: Optional[str] = None
    morphological_type: Optional[str] = None
    html_summary_url: str
    photometry: List[NEDPhotometryResponse] = Field(default_factory=list)
    provenance: dict


class NEDConeHitResponse(BaseModel):
    canonical_name: str
    ra_deg: float
    dec_deg: float
    object_type: str
    separation_arcsec: float
    redshift_value: Optional[float] = None
    velocity_kms: Optional[float] = None
    distance_mpc: Optional[float] = None
    reference_count: int = 0


class NEDConeResponse(BaseModel):
    ra_deg: float
    dec_deg: float
    radius_deg: float
    hits: List[NEDConeHitResponse]
    provenance: dict


class NEDManifestResponse(BaseModel):
    service: str
    base_url: str
    capabilities: dict
    scientific_invariants: dict
    provenance: dict


# ── Conversion helpers ──────────────────────────────────────────────────────


def _object_to_response(query: str, obj: NEDObject) -> NEDObjectResponse:
    """Convert NEDObject → Pydantic response, attaching a PROV bundle."""
    zr: Optional[NEDRedshiftResponse] = None
    if obj.redshift is not None:
        zr = NEDRedshiftResponse(
            value=obj.redshift.value,
            frame=obj.redshift.frame,
            uncertainty=obj.redshift.uncertainty,
            reference=obj.redshift.reference,
        )
    phot_rows = [
        NEDPhotometryResponse(
            survey=p.survey,
            band=p.band,
            magnitude=p.magnitude,
            magnitude_uncertainty=p.magnitude_uncertainty,
            flux_density=p.flux_density,
            flux_density_uncertainty=p.flux_density_uncertainty,
            frequency_hz=p.frequency_hz,
            wavelength_angstrom=p.wavelength_angstrom,
            reference=p.reference,
        )
        for p in obj.photometry
    ]
    provenance = build_provenance_bundle(
        service="NASA/IPAC NED",
        endpoint=f"{NED_BASE_URL}/cgi-bin/objsearch",
        adapter_contract="adapters.ned_adapter:query_ned_by_name",
        extra={
            "query": query,
            "resolved_name": obj.canonical_name,
            "redshift_frame": zr.frame if zr else None,
            "photometry_count": len(phot_rows),
        },
    )
    return NEDObjectResponse(
        query=query,
        canonical_name=obj.canonical_name,
        ra_deg=obj.ra_deg,
        dec_deg=obj.dec_deg,
        object_type=obj.object_type,
        redshift=zr,
        redshift_qualifier=obj.redshift_qualifier,
        velocity_kms=obj.velocity_kms,
        distance_mpc=obj.distance_mpc,
        distance_method=obj.distance_method,
        morphological_type=obj.morphological_type,
        html_summary_url=obj.html_summary_url,
        photometry=phot_rows,
        provenance=provenance,
    )


def _cone_to_response(
    ra: float, dec: float, radius_deg: float, hits: List[NEDConeResult],
) -> NEDConeResponse:
    """Convert NED cone hits → Pydantic response with PROV bundle."""
    hits_resp = [
        NEDConeHitResponse(
            canonical_name=h.canonical_name,
            ra_deg=h.ra_deg,
            dec_deg=h.dec_deg,
            object_type=h.object_type,
            separation_arcsec=h.separation_arcsec,
            redshift_value=h.redshift_value,
            velocity_kms=h.velocity_kms,
            distance_mpc=h.distance_mpc,
            reference_count=h.reference_count,
        )
        for h in hits
    ]
    provenance = build_provenance_bundle(
        service="NASA/IPAC NED",
        endpoint=f"{NED_BASE_URL}/cgi-bin/objsearch (cone)",
        adapter_contract="adapters.ned_adapter:query_ned_cone",
        extra={
            "ra_deg": ra,
            "dec_deg": dec,
            "radius_deg": radius_deg,
            "hits_returned": len(hits_resp),
        },
    )
    return NEDConeResponse(
        ra_deg=ra,
        dec_deg=dec,
        radius_deg=radius_deg,
        hits=hits_resp,
        provenance=provenance,
    )


# ── Routes ───────────────────────────────────────────────────────────────────


@router.get("/object", response_model=NEDObjectResponse)
async def get_ned_object(
    name: str = Query(..., min_length=1, max_length=120,
                      description="NED object name (e.g. 'M87', 'NGC 1275', '3C 273')"),
):
    """Resolve a single NED object by name.

    Returns 404 if NED has no record for the supplied name. Returns 502
    if the NED REST endpoint is unreachable or returns a malformed JSON
    envelope — the response is never padded with synthetic data.
    """
    cleaned = name.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Object name cannot be empty.")

    try:
        obj = await query_ned_by_name(cleaned)
    except NEDConnectionUnreachable as exc:
        raise HTTPException(
            status_code=502,
            detail=f"NED REST endpoint unreachable: {exc}",
        )
    except NEDResponseMalformed as exc:
        raise HTTPException(
            status_code=502,
            detail=f"NED returned a malformed envelope: {exc}",
        )

    if obj is None:
        raise HTTPException(
            status_code=404,
            detail=f"NED has no record for '{cleaned}'.",
        )

    return _object_to_response(cleaned, obj)


@router.get("/cone", response_model=NEDConeResponse)
async def get_ned_cone(
    ra: float = Query(..., ge=0.0, lt=360.0, description="J2000 RA in degrees"),
    dec: float = Query(..., ge=-90.0, le=90.0, description="J2000 Dec in degrees"),
    radius_deg: float = Query(
        0.05, gt=0.0, le=NED_MAX_CONE_RADIUS_DEG,
        description=f"Cone radius in degrees (max {NED_MAX_CONE_RADIUS_DEG})",
    ),
    max_results: int = Query(25, ge=1, le=100, description="Max hits to return"),
):
    """Cone-search NED around (RA, Dec). Empty results are a 200, not a 404.

    A 502 is raised only if the NED REST endpoint is unreachable. The
    adapter never fabricates extragalactic records.
    """
    t0 = time.monotonic()
    try:
        hits = await query_ned_cone(ra, dec, radius_deg, max_results)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except NEDError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"NED cone search failed: {exc}",
        )

    log.info(
        "NED cone ra=%f dec=%f radius=%f -> %d hits in %.2fs",
        ra, dec, radius_deg, len(hits), time.monotonic() - t0,
    )
    return _cone_to_response(ra, dec, radius_deg, hits)


@router.get("/manifest", response_model=NEDManifestResponse)
async def get_ned_manifest():
    """Static manifest of NED adapter capabilities. No network call."""
    provenance = build_provenance_bundle(
        service="NASA/IPAC NED",
        endpoint=f"{NED_BASE_URL}/",
        adapter_contract="adapters.ned_adapter:NED_BASE_URL",
        extra={"manifest": True},
    )
    return NEDManifestResponse(
        service="NASA/IPAC Extragalactic Database (NED)",
        base_url=NED_BASE_URL,
        capabilities={
            "object_by_name": True,
            "cone_search": True,
            "cone_radius_max_deg": NED_MAX_CONE_RADIUS_DEG,
            "max_results_per_query": 100,
            "photometry_rollup": True,
            "redshift_frames": ["heliocentric", "cmb", "galactocentric", "3k"],
        },
        scientific_invariants={
            "synthetic_data": "STRICTLY_PROHIBITED",
            "no_fabricated_photometry": True,
            "redshift_frame_aware": True,
            "default_cosmology": "Planck 2015 (h=0.678, Om=0.308, OL=0.692)",
        },
        provenance=provenance,
    )
