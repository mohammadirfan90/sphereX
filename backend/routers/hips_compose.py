"""Multi-wavelength HiPS composition router (Phase 10).

Endpoint:

  GET /api/hips/compose
        — Build a multi-wavelength SED stack for a target. Returns one
          cutout URL per band, sorted by central wavelength, with
          provenance.

The router never fabricates bands. If a SPHEREx LVF band is missing
from the registry, it is reported in ``missing_band_labels``; the
endpoint does NOT substitute a different band.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from adapters.hips_compose import (
    SEDStack,
    BandCutout,
    compose_sed_at_position,
    HiPSCompositionError,
)
from adapters.provenance import build_provenance_bundle

log = logging.getLogger("hips_compose_router")
router = APIRouter(prefix="/hips/compose", tags=["HiPS multi-wavelength composition"])


class BandCutoutResponse(BaseModel):
    hips_id: str
    hips_release: str | None = None
    category: str
    band_label: str
    central_wavelength_um: float | None = None
    cutout_url: str
    fov_deg: float
    width_px: int
    height_px: int
    pixel_scale_arcsec: float


class SEDStackResponse(BaseModel):
    target_ra_deg: float
    target_dec_deg: float
    fov_deg: float
    width_px: int
    height_px: int
    pixel_scale_arcsec: float
    bands: list[BandCutoutResponse] = Field(default_factory=list)
    n_bands: int
    n_missing: int
    missing_band_labels: list[str] = Field(default_factory=list)
    provenance: dict


def _stack_to_response(s: SEDStack) -> SEDStackResponse:
    bands = [
        BandCutoutResponse(
            hips_id=b.hips_id,
            hips_release=b.hips_release,
            category=b.category,
            band_label=b.band_label,
            central_wavelength_um=b.central_wavelength_um,
            cutout_url=b.cutout_url,
            fov_deg=b.fov_deg,
            width_px=b.width_px,
            height_px=b.height_px,
            pixel_scale_arcsec=b.pixel_scale_arcsec,
        )
        for b in s.bands
    ]
    prov = build_provenance_bundle(
        service="SPHEREx HiPS (IRSA) + CDS/IRSA context HiPS",
        endpoint="internal SED stack composition",
        adapter_contract="adapters.hips_compose:compose_sed_at_position",
        extra={
            "n_bands": s.n_bands,
            "n_missing": s.n_missing,
            **s.provenance,
        },
    )
    return SEDStackResponse(
        target_ra_deg=s.target_ra_deg,
        target_dec_deg=s.target_dec_deg,
        fov_deg=s.fov_deg,
        width_px=s.width_px,
        height_px=s.height_px,
        pixel_scale_arcsec=s.pixel_scale_arcsec,
        bands=bands,
        n_bands=s.n_bands,
        n_missing=s.n_missing,
        missing_band_labels=s.missing_band_labels,
        provenance=prov,
    )


@router.get("", response_model=SEDStackResponse)
async def compose_sed(
    ra: float = Query(..., ge=0.0, lt=360.0),
    dec: float = Query(..., ge=-90.0, le=90.0),
    fov_deg: float = Query(0.05, gt=0.0, le=1.0),
    width_px: int = Query(300, ge=32, le=4096),
    height_px: int = Query(300, ge=32, le=4096),
    spherex_release: str = Query("qr3", pattern="^(qr2|qr3)$"),
    include_context: bool = Query(True),
):
    """Compose a multi-wavelength HiPS SED stack at (RA, Dec).

    Returns one entry per band sorted by central wavelength. Missing
    bands are reported in ``missing_band_labels`` (no substitution).
    """
    try:
        stack = compose_sed_at_position(
            ra_deg=ra, dec_deg=dec, fov_deg=fov_deg,
            width_px=width_px, height_px=height_px,
            spherex_release=spherex_release,
            include_context=include_context,
        )
    except HiPSCompositionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return _stack_to_response(stack)
